const prisma = require('../db');
const { addMonths, startOfMonth, format } = require('date-fns');
// 1. REGISTRAR PAGOS (Vinculados a la Sesión Activa)
async function registrarPagosDinamicos(clienteId, montoRecibido, metodo, sesionId = null) {
    console.log(`\n💰 Procesando abono de $${montoRecibido} para Cliente ID: ${clienteId}...`);

    try {
        const cliente = await prisma.clientes.findUnique({
            where: { id: clienteId },
            include: { domicilios: { include: { servicios: true } } }
        });

        if (!cliente || !cliente.domicilios[0]?.servicios[0]) {
            throw new Error("Cliente o servicio no encontrado");
        }

        const costoMensual = Number(cliente.domicilios[0].servicios[0].precio_mensual);
        
        // 1. Determinar desde qué fecha empezar
        const ultimoPago = await prisma.pagos.findFirst({
            where: { cliente_id: clienteId },
            orderBy: { periodo_inicio: 'desc' }
        });

        let fechaInicioBase;
        let saldoPendienteEnMesActual = 0;

        if (ultimoPago && ultimoPago.periodo_inicio) {
            // Si el último pago fue parcial (menor al costo mensual), completamos ese mes
            if (Number(ultimoPago.monto) < costoMensual) {
                fechaInicioBase = new Date(ultimoPago.periodo_inicio);
                saldoPendienteEnMesActual = costoMensual - Number(ultimoPago.monto);
            } else {
                fechaInicioBase = addMonths(new Date(ultimoPago.periodo_inicio), 1);
            }
        } else {
            fechaInicioBase = startOfMonth(new Date());
        }

        let dineroRestante = montoRecibido;
        const pagosCreados = [];
        let fechaParaSiguientePago = fechaInicioBase;

        // 2. Lógica de distribución de dinero
        while (dineroRestante > 0) {
            let montoAAplicar = 0;
            let esParcial = false;

            // Si hay un saldo pendiente de un mes anterior (pago parcial previo)
            if (saldoPendienteEnMesActual > 0) {
                montoAAplicar = Math.min(dineroRestante, saldoPendienteEnMesActual);
                dineroRestante -= montoAAplicar;
                saldoPendienteEnMesActual = 0; // Ya lo cubrimos (o usamos lo que había)
                
                // Actualizamos el registro anterior o creamos un complemento
                const pagoComplemento = await prisma.pagos.create({
                    data: {
                        cliente_id: clienteId,
                        sesion_id: sesionId,
                        monto: montoAAplicar,
                        metodo_pago: metodo,
                        mes_cubierto: format(fechaParaSiguientePago, 'yyyy-MM'),
                        periodo_inicio: fechaParaSiguientePago,
                        notas: "Complemento de mes parcial"
                    }
                });
                pagosCreados.push(pagoComplemento);
            } 
            else {
                // Si el dinero alcanza para el mes completo o es un sobrante nuevo
                if (dineroRestante >= costoMensual) {
                    montoAAplicar = costoMensual;
                } else {
                    montoAAplicar = dineroRestante;
                    esParcial = true;
                }

                const nuevoPago = await prisma.pagos.create({
                    data: {
                        cliente_id: clienteId,
                        sesion_id: sesionId,
                        monto: montoAAplicar,
                        metodo_pago: metodo,
                        mes_cubierto: format(fechaParaSiguientePago, 'yyyy-MM'),
                        periodo_inicio: fechaParaSiguientePago,
                        notas: esParcial ? `Abono parcial / Sobrante` : `Mensualidad completa`
                    }
                });

                pagosCreados.push(nuevoPago);
                dineroRestante -= montoAAplicar;
            }

            // Avanzamos al siguiente mes solo si no dejamos este mes incompleto
            if (dineroRestante > 0) {
                fechaParaSiguientePago = addMonths(fechaParaSiguientePago, 1);
            }
        }

        return pagosCreados;

    } catch (error) {
        console.error("❌ Error en abono parcial:", error.message);
        throw error;
    }
}
// 2. OBTENER RESUMEN PARA EL ADMIN (Basado en Sesiones Abiertas)
async function obtenerResumenCajaPendiente() {
    console.log("\n💰 --- AUDITORÍA DE SESIONES ACTIVAS ---");

    try {
        // Buscamos sesiones abiertas e incluimos los pagos realizados en ellas
        const sesionesActivas = await prisma.sesiones_Caja.findMany({
            where: { estado: "abierta" },
            include: {
                usuario: true,
                pagos: true
            }
        });

        if (sesionesActivas.length === 0) {
            console.log("✅ No hay sesiones abiertas actualmente.");
            return [];
        }

        const tablaResumen = sesionesActivas.map(s => {
            const totalAcumulado = s.pagos.reduce((sum, p) => sum + Number(p.monto), 0);
            return {
                sesion_id: s.id,
                cobrador_id: s.usuario.nombre, // Cambiamos el ID por el nombre para el Admin
                total: totalAcumulado,
                cantidad_pagos: s.pagos.length
            };
        });

        console.table(tablaResumen.map(r => ({
            "Sesión": `#${r.sesion_id}`,
            "Cajero": r.cobrador_id,
            "Efectivo": new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(r.total),
            "Tickets": r.cantidad_pagos
        })));

        return tablaResumen;

    } catch (error) {
        console.error("❌ Error al generar resumen:", error.message);
        throw error;
    }
}

// 3. REALIZAR CORTE (Liquidar Sesión y crear Corte_Caja)
async function realizarCorteCobrador(sesionId, montoEntregado, observaciones = "") {
    try {
        return await prisma.$transaction(async (tx) => {
            // Obtener datos de la sesión
            const sesion = await tx.sesiones_Caja.findUnique({
                where: { id: sesionId },
                include: { pagos: true, usuario: true }
            });

            if (!sesion || sesion.estado === "cerrada") {
                throw new Error("La sesión ya está cerrada o no existe.");
            }

            const totalEsperado = sesion.pagos.reduce((sum, p) => sum + Number(p.monto), 0);

            // Crear el registro oficial del Corte
            const nuevoCorte = await tx.cortes_Caja.create({
                data: {
                    usuario_id: sesion.usuario_id,
                    usuario_identificador: sesion.usuario.nombre,
                    monto_esperado: totalEsperado,
                    monto_entregado: montoEntregado,
                    diferencia: montoEntregado - totalEsperado,
                    observaciones: observaciones
                }
            });

            // Cerrar la sesión
            await tx.sesiones_Caja.update({
                where: { id: sesionId },
                data: {
                    estado: "cerrada",
                    fecha_cierre: new Date(),
                    monto_final: montoEntregado
                }
            });

            // Vincular pagos al corte para auditoría
            await tx.pagos.updateMany({
                where: { sesion_id: sesionId },
                data: { corte_id: nuevoCorte.id }
            });

            console.log(`💰 Corte de Sesión #${sesionId} completado.`);
            return nuevoCorte;
        });
    } catch (error) {
        console.error("❌ Error en el corte:", error.message);
        throw error;
    }
}

// Mantenemos esta función para tus reportes de cobranza programada
async function generarReporteCobranza(diaReferencia) {
    // (Mantiene tu lógica actual de búsqueda de clientes por día de pago)
    // ...
}

module.exports = { 
    registrarPagosDinamicos, 
    generarReporteCobranza,
    realizarCorteCobrador,
    obtenerResumenCajaPendiente 
};
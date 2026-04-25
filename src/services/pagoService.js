const prisma = require('../db');
const { addMonths, startOfMonth, format } = require('date-fns');

// 1. REGISTRAR PAGOS (Vinculados a la Sesión Activa)
async function registrarPagosDinamicos(clienteId, montoRecibido, metodo, sesionId = null) {
    console.log(`\n💰 Procesando pago de $${montoRecibido} para Cliente ID: ${clienteId}...`);

    try {
        // Obtener datos del cliente y su servicio
        const cliente = await prisma.clientes.findUnique({
            where: { id: clienteId },
            include: { domicilios: { include: { servicios: true } } }
        });

        if (!cliente || !cliente.domicilios[0]?.servicios[0]) {
            throw new Error("Cliente o servicio no encontrado");
        }

        const costoMensual = Number(cliente.domicilios[0].servicios[0].precio_mensual);
        const mesesPagados = Math.floor(montoRecibido / costoMensual);

        if (mesesPagados === 0) {
            throw new Error(`El monto $${montoRecibido} es insuficiente para cubrir al menos un mes ($${costoMensual})`);
        }

        // Buscar el último pago para el periodo
        const ultimoPago = await prisma.pagos.findFirst({
            where: { cliente_id: clienteId },
            orderBy: { periodo_inicio: 'desc' }
        });

        let fechaInicioBase;
        if (ultimoPago && ultimoPago.periodo_inicio) {
            fechaInicioBase = addMonths(new Date(ultimoPago.periodo_inicio), 1);
        } else {
            fechaInicioBase = startOfMonth(new Date());
        }

        const pagosCreados = [];
        for (let i = 0; i < mesesPagados; i++) {
            const periodoActual = addMonths(fechaInicioBase, i);
            const mesFormateado = format(periodoActual, 'yyyy-MM');

            const nuevoPago = await prisma.pagos.create({
                data: {
                    cliente_id: clienteId,
                    sesion_id: sesionId, // <--- CAMBIO CLAVE: Vinculamos a la sesión de caja
                    monto: costoMensual,
                    metodo_pago: metodo,
                    mes_cubierto: mesFormateado,
                    periodo_inicio: periodoActual,
                    notas: i === 0 && mesesPagados > 1 ? `Pago multimes. Total recibido: $${montoRecibido}` : null
                }
            });
            pagosCreados.push(nuevoPago);
        }

        console.log(`✅ Registro exitoso: ${mesesPagados} mes(es) cubierto(s)`);
        return pagosCreados;

    } catch (error) {
        console.error("❌ Error al registrar pago:", error.message);
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
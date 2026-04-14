const prisma = require('../db');
async function registrarPagosDinamicos(clienteId, montoRecibido, metodo, cobradorId = null) {
    console.log(`\n💰 Procesando pago de $${montoRecibido} para Cliente ID: ${clienteId}...`);

    try {
        // 1. Obtener datos del cliente y su servicio para saber el costo mensual
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

        // 2. Buscar el último pago para saber desde qué mes empezar a contar
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

        // 3. Crear los registros de pagos (uno por cada mes cubierto)
        const pagosCreados = [];
        for (let i = 0; i < mesesPagados; i++) {
            const periodoActual = addMonths(fechaInicioBase, i);
            const mesFormateado = format(periodoActual, 'yyyy-MM');

            const nuevoPago = await prisma.pagos.create({
                data: {
                    cliente_id: clienteId,
                    monto: costoMensual, // Dividimos el total en mensualidades exactas
                    metodo_pago: metodo,
                    mes_cubierto: mesFormateado,
                    periodo_inicio: periodoActual,
                    cobrador_id: cobradorId, // <--- AQUÍ SE ASIGNA EL RESPONSABLE DEL DINERO
                    notas: i === 0 && mesesPagados > 1 ? `Pago multimes. Total recibido: $${montoRecibido}` : null
                }
            });
            pagosCreados.push(nuevoPago);
        }

        console.log(`✅ Registro exitoso: ${mesesPagados} mes(es) cubierto(s) hasta ${format(addMonths(fechaInicioBase, mesesPagados - 1), 'MMMM yyyy')}`);
        return pagosCreados;

    } catch (error) {
        console.error("❌ Error al registrar pago:", error.message);
        throw error;
    }
}

async function generarReporteCobranza(diaReferencia) {
    console.log(`\n--- 📊 REPORTE DE COBRANZA (Día de pago: ${diaReferencia}) ---`);

    try {
        const porCobrar = await prisma.clientes.findMany({
            where: {
                estatus: 'activo',
                domicilios: {
                    some: {
                        dia_pago_mensual: diaReferencia
                    }
                }
            },
            include: {
                domicilios: {
                    include: {
                        servicios: true
                    }
                }
            }
        });

        if (porCobrar.length === 0) {
            console.log(`✅ No hay cobros programados para el día ${diaReferencia}.`);
            return;
        }

        console.table(porCobrar.map(cliente => {
            const servicio = cliente.domicilios[0]?.servicios[0];
            return {
                Cliente: cliente.nombre_completo,
                Telefono: cliente.telefono_principal,
                Colonia: cliente.domicilios[0]?.colonia || 'N/A',
                Plan: `${servicio?.megas_bajada || 0}MB`,
                Monto: `$${servicio?.precio_mensual || 0}`
            };
        }));

    } catch (error) {
        console.error("❌ Error al generar reporte:", error.message);
    }
}
async function realizarCorteCobrador(cobradorId) {
    try {
        // 1. Buscamos todos los pagos de este cobrador que NO tengan corte asignado
        const pagosPendientes = await prisma.pagos.findMany({
            where: {
                // Aquí necesitaríamos que la tabla Pagos tenga un campo 'cobrador_id'
                // y un campo 'corte_id' que sea null
                cobrador_id: cobradorId,
                corte_id: null 
            }
        });

        const totalAcumulado = pagosPendientes.reduce((sum, p) => sum + Number(p.monto_pagado), 0);

        // 2. Creamos el registro del corte
        const nuevoCorte = await prisma.cortes_Caja.create({
            data: {
                cobrador_id: cobradorId,
                monto_total: totalAcumulado,
                pagos_contabilizados: pagosPendientes.length,
            }
        });

        // 3. Marcamos esos pagos como "ya entregados" vinculándolos al ID del corte
        await prisma.pagos.updateMany({
            where: { id: { in: pagosPendientes.map(p => p.id) } },
            data: { corte_id: nuevoCorte.id }
        });

        console.log(`💰 Corte exitoso: Se recibieron ${totalAcumulado} de ${pagosPendientes.length} pagos.`);
        return nuevoCorte;
    } catch (error) {
        console.error("❌ Error al realizar el corte:", error.message);
    }
}
// Exportamos ambas funciones
module.exports = { 
    registrarPagosDinamicos, 
    generarReporteCobranza,
    realizarCorteCobrador // <-- Nueva función agregada
};



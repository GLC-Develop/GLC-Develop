const prisma = require('../db');
async function registrarPagosDinamicos(clienteId, montoRecibido, metodo) {
    console.log(`\n💰 Procesando pago de $${montoRecibido} para el cliente ID: ${clienteId}...`);

    try {
        // 1. Buscamos el precio mensual real del servicio del cliente
        const servicio = await prisma.servicios_Red.findFirst({
            where: { domicilio: { cliente_id: clienteId } }
        });

        if (!servicio) {
            throw new Error("El cliente no tiene un servicio de red activo configurado.");
        }

        const PRECIO_PLAN = parseFloat(servicio.precio_mensual);
        let saldoRestante = parseFloat(montoRecibido);

        // 2. Transacción para asegurar que la "cadena de pagos" sea perfecta
        const resultados = await prisma.$transaction(async (tx) => {
            const mesesPagados = [];

            while (saldoRestante >= PRECIO_PLAN) {
                // Buscamos el último pago para saber cuál es el siguiente mes
                const ultimo = await tx.pagos.findFirst({
                    where: { cliente_id: clienteId },
                    orderBy: { mes_cubierto: 'desc' }
                });

                let proximoMes;
                if (ultimo) {
                    const [anio, mes] = ultimo.mes_cubierto.split('-').map(Number);
                    let nMes = mes + 1, nAnio = anio;
                    if (nMes > 12) { nMes = 1; nAnio++; }
                    proximoMes = `${nAnio}-${String(nMes).padStart(2, '0')}`;
                } else {
                    const ahora = new Date();
                    proximoMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
                }

                const nuevoPago = await tx.pagos.create({
                    data: {
                        cliente_id: clienteId,
                        monto: PRECIO_PLAN,
                        metodo_pago: metodo,
                        mes_cubierto: proximoMes,
                        notas: `Pago automático basado en plan de ${servicio.megas_bajada}MB`
                    }
                });

                mesesPagados.push(nuevoPago.mes_cubierto);
                saldoRestante -= PRECIO_PLAN;
            }

            return { mesesPagados, saldoRestante };
        });

        console.log(`✅ Éxito. Se cubrieron los meses: ${resultados.mesesPagados.join(', ')}`);
        if (resultados.saldoRestante > 0) {
            console.log(`💵 Cambio/Saldo a favor: $${resultados.saldoRestante}`);
        }

    } catch (error) {
        console.error("❌ Error en pago dinámico:", error.message);
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

// Exportamos ambas funciones
module.exports = { 
    registrarPagosDinamicos, 
    generarReporteCobranza 
};
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// En v6, el constructor vacío funciona porque lee el schema y el .env solo
const prisma = new PrismaClient();

async function listarClientesActivos() {
    const clientes = await prisma.clientes.findMany({
        where: { estatus: 'activo' },
        include: {
            domicilios: true
        }
    });

    console.log("📂 Clientes registrados en el sistema:");
    if (clientes.length === 0) {
        console.log("   (No hay clientes activos aún)");
    } else {
        console.table(clientes.map(c => ({
            Nombre: c.nombre_completo,
            Telefono: c.telefono_principal,
            Domicilios: c.domicilios.length
        })));
    }
}

async function registrarInstalacion(datos) {
    try {
        const resultado = await prisma.$transaction(async(tx) => {
            // 1. Crear el Cliente
            const nuevoCliente = await tx.clientes.create({
                data: {
                    nombre_completo: datos.nombre,
                    telefono_principal: datos.telefono,
                    email: datos.email,
                }
            });

            // 2. Crear el Domicilio
            const nuevoDomicilio = await tx.domicilios.create({
                data: {
                    cliente_id: nuevoCliente.id,
                    direccion_exacta: datos.direccion,
                    colonia: datos.colonia,
                    dia_pago_mensual: datos.diaPago,
                }
            });

            // 3. Crear el Servicio
            const nuevoServicio = await tx.servicios_Red.create({
                data: {
                    domicilio_id: nuevoDomicilio.id,
                    ip_interna: datos.ip,
                    megas_bajada: datos.planBajada,
                    megas_subida: datos.planSubida,
                }
            });

            // 4. Vincular el Equipo
            const equipo = await tx.equipos_Instalados.create({
                data: {
                    servicio_id: nuevoServicio.id,
                    tipo_equipo: datos.tipoEquipo,
                    marca: datos.marca,
                    modelo: datos.modelo,
                    mac: datos.mac,
                }
            });

            return { nuevoCliente, equipo };
        });

        console.log(`✅ Instalación exitosa: ${resultado.nuevoCliente.nombre_completo} con MAC ${resultado.equipo.mac}`);

    } catch (error) {
        console.error("❌ Error en la instalación:", error.message);
    }
}

async function generarReporteCobranza(diaReferencia) {
    console.log(`\n--- 📊 REPORTE DE COBRANZA (Día de pago: ${diaReferencia}) ---`);

    try {
        const porCobrar = await prisma.clientes.findMany({
            where: {
                estatus: 'activo', // Solo clientes que tienen servicio
                domicilios: {
                    some: {
                        dia_pago_mensual: diaReferencia
                    }
                }
            },
            include: {
                domicilios: true,
                // Si tienes una tabla de 'Pagos', aquí podrías incluirla para filtrar los que ya pagaron
            }
        });

        if (porCobrar.length === 0) {
            console.log("✅ No hay cobros pendientes programados para este día.");
            return;
        }

        console.table(porCobrar.map(cliente => ({
            Cliente: cliente.nombre_completo,
            Telefono: cliente.telefono_principal,
            Colonia: cliente.domicilios[0]?.colonia || 'N/A',
            'Día Pago': cliente.domicilios[0]?.dia_pago_mensual || 'N/A'
        })));

    } catch (error) {
        console.error("❌ Error al generar el reporte:", error.message);
    }
}
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

async function testRegistroCompleto() {
    console.log("🛠 Iniciando prueba de registro integral...");

    try {
        const nuevoCliente = await prisma.clientes.create({
            data: {
                nombre_completo: "Gildardo L. - Cliente Prueba",
                telefono_principal: "9991234567",
                email: "prueba@wisp.com",
                domicilios: {
                    create: {
                        // Usamos los campos exactos de tu modelo Domicilios:
                        direccion_exacta: "Av. Tecnológico #500", // Aquí va calle y número
                        colonia: "Industrial",
                        referencias: "Frente al parque principal, portón negro",
                        dia_pago_mensual: 10,
                        servicios: {
                            create: {
                                ip_interna: "192.168.100.20",
                                megas_bajada: 30,
                                megas_subida: 15,
                                precio_mensual: 350.00
                            }
                        }
                    }
                }
            },
            include: {
                domicilios: {
                    include: { servicios: true }
                }
            }
        });

        console.log("✅ Cliente, Domicilio y Servicio creados con éxito.");
        console.log(`ID Cliente: ${nuevoCliente.id}`);
        return nuevoCliente;

    } catch (error) {
        console.error("❌ Error en la prueba de registro:");
        console.error(error.message);
    }
}
// 1. Abrir Ticket
async function abrirTicket(clienteId, titulo, descripcion, prioridad = "media") {
    try {
        const ticket = await prisma.tickets_Soporte.create({
            data: {
                cliente_id: clienteId,
                titulo: titulo,
                descripcion: descripcion,
                prioridad: prioridad
            }
        });
        console.log(`🎫 Ticket #${ticket.id} abierto para el cliente ID: ${clienteId}`);
        return ticket;
    } catch (error) {
        console.error("❌ Error al abrir ticket:", error.message);
    }
}

// 2. Cerrar Ticket y Registrar Gastos
async function cerrarTicket(ticketId, materiales, manoObra, notasResolucion) {
    try {
        // 1. Primero buscamos el ticket actual para no perder lo que escribimos al abrirlo
        const ticketActual = await prisma.tickets_Soporte.findUnique({
            where: { id: ticketId }
        });

        if (!ticketActual) throw new Error("Ticket no encontrado");

        // 2. Ahora sí, actualizamos pegando la resolución al final de la descripción
        const ticketCerrado = await prisma.tickets_Soporte.update({
            where: { id: ticketId },
            data: {
                estatus: "cerrado",
                costo_materiales: materiales,
                mano_obra_extra: manoObra,
                // Concatenamos el texto viejo con el nuevo manualmente
                descripcion: `${ticketActual.descripcion}\n\n✅ RESOLUCIÓN: ${notasResolucion}`,
                fecha_resolucion: new Date()
            }
        });

        console.log(`✅ Ticket #${ticketId} cerrado. Gasto operativo total: $${parseFloat(materiales) + parseFloat(manoObra)}`);
    } catch (error) {
        console.error("❌ Error al cerrar ticket:", error.message);
    }
}


// FUNCIÓN PRINCIPAL (Aquí va todo el flujo)
async function main() {
    const miTicket = await abrirTicket(1, "Lentitud en hora pico", "El cliente reporta que a las 8pm no puede ver Netflix", "alta");

    if (miTicket) {
        // Simulamos que fuiste al domicilio, cambiaste un conector RJ45 ($50) y cobraste $100 de vuelta
        await cerrarTicket(miTicket.id, 50.00, 100.00, "Se cambió conector oxidado y se alineó antena.");
    }
}

main()
    .catch((e) => {
        console.error("❌ Error crítico en el backend:", e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
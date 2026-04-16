const prisma = require('../db');

// Función para ver quiénes están en servicio
async function listarClientesActivos() {
    console.log("\n📋 LISTADO DE CLIENTES ACTIVOS");
    try {
        const activos = await prisma.clientes.findMany({
            where: { estatus: 'activo' },
            include: {
                domicilios: {
                    include: { servicios: true }
                }
            }
        });

        if (activos.length === 0) {
            console.log("No hay clientes activos registrados.");
            return;
        }

        console.table(activos.map(c => ({
            ID: c.id,
            Nombre: c.nombre_completo,
            IP: c.domicilios[0]?.servicios[0]?.ip_interna || 'N/A',
            Plan: `${c.domicilios[0]?.servicios[0]?.megas_bajada}MB`,
            Celular: c.telefono_principal
        })));
    } catch (error) {
        console.error("❌ Error al listar activos:", error.message);
    }
}

// La función maestra de instalación que usamos en las pruebas
async function registrarInstalacion(datos) {
    try {
        const nuevo = await prisma.clientes.create({
            data: {
                nombre_completo: datos.nombre_completo,
                telefono_principal: datos.telefono || "0000000000",
                email: datos.email || "",
                domicilios: {
                    create: {
                        direccion_exacta: datos.calle,
                        colonia: datos.colonia || "General",
                        referencias: datos.referencias || "",
                        dia_pago_mensual: 5, // Valor por defecto
                        servicios: { // 👈 Nombre exacto en tu modelo Domicilios
                            create: {
                                ip_interna: datos.ip_antena,
                                megas_bajada: parseInt(datos.bajada) || 10,
                                megas_subida: parseInt(datos.subida) || 5,
                                precio_mensual: parseFloat(datos.precio) || 400.00,
                                tipo_servicio: datos.tipo_tecnologia || "WISP",
                                equipos: { // 👈 Nombre exacto en tu modelo Servicios_Red
                                    create: datos.equipos.map(e => ({
                                        tipo_equipo: e.tipo_equipo,
                                        marca: e.marca,
                                        modelo: e.modelo,
                                        mac: e.mac,
                                        serie: e.serie || ""
                                    }))
                                }
                            }
                        }
                    }
                }
            }
        });
        return nuevo;
    } catch (error) {
        console.error("❌ Error en registro de instalación:", error);
        throw error;
    }
}
module.exports = { listarClientesActivos, registrarInstalacion };
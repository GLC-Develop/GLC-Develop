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
                nombre_completo: datos.nombre,
                telefono_principal: datos.telefono,
                email: datos.email,
                domicilios: {
                    create: {
                        direccion_exacta: datos.direccion,
                        colonia: datos.colonia,
                        referencias: datos.referencias,
                        dia_pago_mensual: datos.diaPago,
                        servicios: {
                            create: {
                                ip_interna: datos.ip,
                                megas_bajada: datos.bajada,
                                megas_subida: datos.subida,
                                precio_mensual: datos.precio
                            }
                        }
                    }
                }
            }
        });
        console.log(`✅ Instalación registrada exitosamente. ID: ${nuevo.id}`);
        return nuevo;
    } catch (error) {
        console.error("❌ Error en registro de instalación:", error.message);
    }
}

module.exports = { listarClientesActivos, registrarInstalacion };
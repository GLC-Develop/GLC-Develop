const prisma = require('../db');

async function buscarCliente(criterio) {
    console.log(`\n🔍 Buscando información para: "${criterio}"...`);

    try {
        const resultados = await prisma.clientes.findMany({
            where: {
                OR: [
                    { nombre_completo: { contains: criterio, mode: 'insensitive' } },
                    { telefono_principal: { contains: criterio } },
                    { 
                        domicilios: {
                            some: {
                                servicios: {
                                    some: {
                                        OR: [
                                            { ip_interna: { contains: criterio } },
                                            // Si tienes el campo MAC en Equipos_Instalados, también lo buscaría aquí
                                        ]
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            include: {
                domicilios: {
                    include: {
                        servicios: true
                    }
                }
            }
        });

        if (resultados.length === 0) {
            console.log("❌ No se encontraron clientes con ese criterio.");
            return;
        }

        console.log(`✅ Se encontraron ${resultados.length} coincidencia(s):`);
        
        resultados.forEach(c => {
            const dom = c.domicilios[0];
            const serv = dom?.servicios[0];
            
            console.log(`
            -------------------------------------------
            👤 CLIENTE: ${c.nombre_completo}
            📞 TEL: ${c.telefono_principal}
            🏠 DIR: ${dom?.direccion_exacta}, ${dom?.colonia}
            🌐 IP: ${serv?.ip_interna || 'Sin IP'}
            📊 PLAN: ${serv?.megas_bajada}MB / $${serv?.precio_mensual}
            -------------------------------------------
            `);
        });
		return resultados;
    } catch (error) {
        console.error("❌ Error en la búsqueda:", error.message);
    }
}


module.exports = { buscarCliente };
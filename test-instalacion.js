const clienteService = require('./src/services/clienteService');

async function pruebaBackend() {
    console.log("🚀 Iniciando prueba de inserción técnica...");

    const datosPrueba = {
        nombre_completo: "Cliente Prueba Unificada",
        telefono: "1234567890",
        email: "prueba@wisp.com",
        calle: "Av. Tecnológico 123",
        colonia: "Centro",
        referencias: "Casa azul frente al parque",
        ip_antena: "10.0.0.50", // Debe ser única en tu DB
        bajada: 20,
        subida: 10,
        precio: 450,
        tipo_tecnologia: "WISP",
        equipos: [
            {
                tipo_equipo: "Antena",
                marca: "Ubiquiti",
                modelo: "LiteBeam 5AC",
                mac: "AA:BB:CC:11:22:33", // Debe ser única
                serie: "SN12345"
            },
            {
                tipo_equipo: "Router",
                marca: "MikroTik",
                modelo: "hAP ac2",
                mac: "DD:EE:FF:44:55:66", // Debe ser única
                serie: "SN67890"
            }
        ]
    };

    try {
        const resultado = await clienteService.registrarInstalacion(datosPrueba);
        console.log("✅ ÉXITO: Cliente y equipos registrados!");
        console.log("ID Generado:", resultado.id);
    } catch (error) {
        console.error("❌ FALLÓ LA PRUEBA:");
        // Esto nos dará el error detallado de Prisma
        if (error.code) {
            console.error("Código de error Prisma:", error.code);
            console.error("Meta información:", error.meta);
        } else {
            console.error(error);
        }
    } finally {
        process.exit();
    }
}

pruebaBackend();
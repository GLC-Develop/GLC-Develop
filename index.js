const { listarClientesActivos, registrarInstalacion } = require('./src/services/clienteService');
const { buscarCliente } = require('./src/services/busquedaService');
const { abrirTicket, cerrarTicket } = require('./src/services/ticketService');
const { registrarPagosDinamicos, generarReporteCobranza } = require('./src/services/pagoService');
const prisma = require('./src/db');
async function testArquitecturaModular() {
    console.log("🧪 INICIANDO PRUEBAS DE SISTEMA MODULAR\n");

    try {
        // 1. Probar ClienteService (Registro)
        console.log("1️⃣ Probando Registro de Instalación...");
        const cliente = await registrarInstalacion({
            nombre: "Prueba Modular " + Date.now(),
            telefono: "9990001122",
            direccion: "Calle Falsa 123",
            colonia: "Centro",
            diaPago: 15,
            ip: `10.0.0.${Math.floor(Math.random() * 254)}`,
            bajada: 20,
            subida: 10,
            precio: 400
        });

        // 2. Probar ClienteService (Listar)
        await listarClientesActivos();

        // 3. Probar BusquedaService
        if (cliente) {
            await buscarCliente(cliente.nombre_completo);
        }

        // 4. Probar PagoService (Reporte y Pago)
        await generarReporteCobranza(15);
        if (cliente) {
            await registrarPagosDinamicos(cliente.id, 800, "Transferencia"); // Debería cubrir 2 meses
        }

        // 5. Probar TicketService
        if (cliente) {
            const ticket = await abrirTicket(cliente.id, "Falla de prueba", "Validando módulos", "baja");
            await cerrarTicket(ticket.id, 0, 0, "Prueba modular exitosa");
        }

        console.log("\n✅ TODAS LAS PRUEBAS PASARON CORRECTAMENTE");

    } catch (error) {
        console.error("\n❌ FALLA EN LAS PRUEBAS:", error.message);
    }
}

// FUNCIÓN PRINCIPAL (Aquí va todo el flujo)
async function main() {
    await testArquitecturaModular();
}

main()
    .catch((e) => {
        console.error("❌ Error crítico en el backend:", e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
const { registrarPagosDinamicos, obtenerResumenCajaPendiente } = require('./src/services/pagoService');
const prisma = require('./src/db');

async function testAuditoria() {
    console.log("🧪 INICIANDO PRUEBA DE AUDITORÍA Y LIQUIDACIÓN\n");

    try {
        // 1. Limpiamos pagos de prueba previos para tener números exactos (Opcional en dev)
        // await prisma.pagos.deleteMany({ where: { notas: 'TEST_AUDITORIA' } });

        console.log("📥 Registrando pagos en diferentes puntos...");

        // Simulación: Tienda A (ID 100) recibe 2 pagos
        await registrarPagosDinamicos(1, 400, "Efectivo", 100);
        await registrarPagosDinamicos(2, 400, "Efectivo", 100);

        // Simulación: Tienda B (ID 101) recibe 1 pago
        await registrarPagosDinamicos(3, 400, "Efectivo", 101);

        // Simulación: Cobrador Calle (ID 102) recibe 1 pago grande (2 meses)
        await registrarPagosDinamicos(4, 800, "Efectivo", 102);

        console.log("\n📊 Calculando resumen de liquidación...");
        
        // 2. Ejecutar la función de reporte que creamos
        const reporte = await obtenerResumenCajaPendiente();

        // 3. Validación de Resultados
        console.log("\n✅ VALIDACIÓN DE SALDOS:");
        reporte.forEach(r => {
            if (r.cobrador_id === 100) console.log(`Tienda A: ${r.total === 800 ? 'CORRECTO ($800)' : 'ERROR'}`);
            if (r.cobrador_id === 101) console.log(`Tienda B: ${r.total === 400 ? 'CORRECTO ($400)' : 'ERROR'}`);
            if (r.cobrador_id === 102) console.log(`Cobrador: ${r.total === 800 ? 'CORRECTO ($800)' : 'ERROR'}`);
        });

    } catch (error) {
        console.error("❌ Fallo en la prueba manual:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testAuditoria();
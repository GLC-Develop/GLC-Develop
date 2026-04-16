const express = require('express');
const app = express();
const port = 3000;
const prisma = require('./src/db');

// Importamos los servicios que ya tenemos listos
const { buscarCliente } = require('./src/services/busquedaService');
const { 
    registrarPagosDinamicos, 
    generarReporteCobranza, 
    realizarCorteCobrador,
obtenerResumenCajaPendiente	// ✅ La importamos aquí
} = require('./src/services/pagoService');

app.use(express.json()); // Para que el servidor entienda datos en formato JSON
app.use(express.static('public'));
// RUTA 1: Buscar cliente (Para el buscador de la tienda)
app.get('/api/buscar', async (req, res) => {
    const { criterio } = req.query;
    try {
        // Usamos la lógica que ya probamos
        const resultados = await buscarCliente(criterio); 
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// RUTA 2: Registrar Pago (Para el botón de cobrar)
app.post('/api/pagar', async (req, res) => {
    // Ahora recibimos también el cobradorId desde el Front-end
    const { clienteId, monto, metodo, cobradorId } = req.body; 
    
    try {
        const resultado = await registrarPagosDinamicos(clienteId, monto, metodo, parseInt(cobradorId));
        res.json({ mensaje: "Pago procesado y asignado al cobrador", detalle: resultado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// En server.js
// server.js
app.get('/api/ticket/:pagoId', async (req, res) => {
    try {
        const pago = await prisma.pagos.findUnique({
            where: { id: parseInt(req.params.pagoId) },
            include: { 
                cliente: true // <--- ESTO ES VITAL: Trae los datos del cliente vinculados al pago
            }
        });

        if (!pago) {
            return res.status(404).json({ error: "Pago no encontrado" });
        }

        res.json(pago);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reporte-liquidaciones', async (req, res) => {
    try {
        const resumen = await obtenerResumenCajaPendiente();
        res.json(resumen);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const clienteService = require('./src/services/clienteService');

app.post('/api/instalacion', async (req, res) => {
    try {
        const resultado = await clienteService.registrarInstalacion(req.body);
        res.status(201).json({ mensaje: "¡Éxito!", cliente: resultado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const ticketService = require('./src/services/ticketService');

app.post('/api/tickets', async (req, res) => {
    try {
        const { cliente_id, titulo, descripcion, prioridad } = req.body;
        
        // Usamos tu función existente de ticketService.js
        const ticket = await ticketService.abrirTicket(
            parseInt(cliente_id), 
            titulo, 
            descripcion, 
            prioridad
        );
        
        res.status(201).json({ mensaje: "Ticket abierto correctamente", ticket });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// En server.js para hacer el corte de caja al cobrador
app.post('/api/liquidar-caja', async (req, res) => {
    const { cobradorId, montoEntregado, observaciones } = req.body;
    try {
        // Llamamos a la función que ya tenemos en el servicio
        const resultado = await realizarCorteCobrador(cobradorId, montoEntregado, observaciones);
        res.json({ mensaje: "Liquidación completada con éxito", corte: resultado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(port, () => {
    console.log(`🚀 Servidor ERP-Wisp corriendo en http://localhost:${port}`);
});
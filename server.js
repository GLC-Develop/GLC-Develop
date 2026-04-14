const express = require('express');
const app = express();
const port = 3000;

// Importamos los servicios que ya tenemos listos
const { buscarCliente } = require('./src/services/busquedaService');
const { 
    registrarPagosDinamicos, 
    generarReporteCobranza, 
    realizarCorteCobrador // ✅ La importamos aquí
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
app.listen(port, () => {
    console.log(`🚀 Servidor ERP-Wisp corriendo en http://localhost:${port}`);
});
const express = require('express');
const app = express();
const port = 3000;
const prisma = require('./src/db');

// Servicios Unificados
const { buscarCliente } = require('./src/services/busquedaService');
const { registrarPagosDinamicos } = require('./src/services/pagoService');
const clienteService = require('./src/services/clienteService');
const ticketService = require('./src/services/ticketService');
const authService = require('./src/services/authService');

app.use(express.json());
app.use(express.static('public'));

// --- MÓDULO DE AUTENTICACIÓN & SESIONES ---
app.post('/api/auth/pos', async (req, res) => {
    try {
        const { pin, info } = req.body;
        const resultado = await authService.iniciarSesionPOS(pin, info);
        res.json(resultado);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// --- MÓDULO DE CLIENTES E INSTALACIONES ---
app.get('/api/buscar', async (req, res) => {
    const { criterio } = req.query;
    try {
        const resultados = await buscarCliente(criterio); 
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/instalacion', async (req, res) => {
    try {
        const resultado = await clienteService.registrarInstalacion(req.body);
        res.status(201).json({ mensaje: "¡Éxito!", cliente: resultado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- MÓDULO DE PAGOS & CAJA (EL CORE DEL NEGOCIO) ---

// 1. Registrar pago vinculado a la SESIÓN ACTIVA
app.post('/api/pagar', async (req, res) => {
    const { clienteId, monto, metodo, sesionId } = req.body; // Cambiamos cobradorId por sesionId
    try {
        const resultado = await registrarPagosDinamicos(clienteId, monto, metodo, parseInt(sesionId));
        res.json({ mensaje: "Pago registrado en la sesión", detalle: resultado });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Reporte para el ADMIN (Busca sesiones abiertas con dinero)
app.get('/api/reporte-liquidaciones', async (req, res) => {
    try {
        const sesionesAbiertas = await prisma.sesiones_Caja.findMany({
            where: { estado: "abierta" },
            include: {
                usuario: true,
                pagos: true
            }
        });

        const resumen = sesionesAbiertas.map(s => {
            const total = s.pagos.reduce((sum, p) => sum + Number(p.monto), 0);
            return {
                sesion_id: s.id,
                cobrador_nombre: s.usuario.nombre,
                cantidad_pagos: s.pagos.length,
                total: total
            };
        });
        res.json(resumen);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Hacer el CORTE (Liquidar sesión)
app.post('/api/liquidar-caja', async (req, res) => {
    const { sesionId, montoEntregado, observaciones } = req.body;
    try {
        // Aquí puedes llamar a una función en pagoService que use prisma.$transaction
        // para cerrar la sesión y crear el registro en Cortes_Caja
        res.json({ mensaje: "Función de liquidación en desarrollo (Sesión #" + sesionId + ")" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- MÓDULO DE TICKETS SOPORTE ---
app.post('/api/tickets', async (req, res) => {
    try {
        const { cliente_id, titulo, descripcion, prioridad } = req.body;
        const ticket = await ticketService.abrirTicket(parseInt(cliente_id), titulo, descripcion, prioridad);
        res.status(201).json({ mensaje: "Ticket abierto correctamente", ticket });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- TICKETS PARA IMPRESIÓN ---
app.get('/api/ticket/:pagoId', async (req, res) => {
    try {
        const pago = await prisma.pagos.findUnique({
            where: { id: parseInt(req.params.pagoId) },
            include: { cliente: true }
        });
        if (!pago) return res.status(404).json({ error: "Pago no encontrado" });
        res.json(pago);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor ERP-Wisp centralizado en http://localhost:${port}`);
});
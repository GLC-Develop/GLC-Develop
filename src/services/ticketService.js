const prisma = require('../db');
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

module.exports = { abrirTicket, cerrarTicket };
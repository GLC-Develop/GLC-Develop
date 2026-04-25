const prisma = require('../db');

async function iniciarSesionPOS(pin, infoDispositivo) {
    try {
        // 1. Buscamos al usuario por su PIN único
        const usuario = await prisma.usuarios.findUnique({
            where: { pin: pin }
        });

        if (!usuario || !usuario.activo) {
            throw new Error("PIN incorrecto o usuario inactivo");
        }

        // 2. Verificamos si ya tiene una sesión abierta
        const sesionActiva = await prisma.sesiones_Caja.findFirst({
            where: {
                usuario_id: usuario.id,
                estado: "abierta"
            }
        });

        if (sesionActiva) {
            return { usuario, sesion: sesionActiva, mensaje: "Sesión ya estaba abierta" };
        }

        // 3. Si no hay sesión, abrimos una nueva
        const nuevaSesion = await prisma.sesiones_Caja.create({
            data: {
                usuario_id: usuario.id,
                monto_inicial: 0, // Esto lo podemos pedir luego en el front
                dispositivo_info: infoDispositivo || "Navegador POS",
                estado: "abierta"
            }
        });

        return { usuario, sesion: nuevaSesion, mensaje: "Sesión iniciada correctamente" };
    } catch (error) {
        console.error("❌ Error en Auth:", error.message);
        throw error;
    }
}

module.exports = { iniciarSesionPOS };
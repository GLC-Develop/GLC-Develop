require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// En v6, el constructor vacío funciona porque lee el schema y el .env solo
const prisma = new PrismaClient();
module.exports = prisma;
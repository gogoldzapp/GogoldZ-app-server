import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export default prisma;
// Optional: test DB connection
// async function testConnection() {
//   try {
//     await prisma.$connect();
//     console.log("✅ PostgreSQL (Prisma) connected");
//   } catch (err) {
//     console.error("❌ Prisma connection error:", err);
//   }
// }
// testConnection();

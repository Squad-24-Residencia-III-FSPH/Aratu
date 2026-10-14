import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use(healthRoutes);

export default app;
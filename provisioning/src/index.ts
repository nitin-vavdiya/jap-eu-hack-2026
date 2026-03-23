import 'dotenv/config';
import express from 'express';
import { provisionRouter } from './routes/provision';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'edc-provisioning' });
});

app.use('/', provisionRouter);

app.listen(PORT, () => {
  console.log(`[provisioning] Service started on port ${PORT} (internal-only, no public ingress)`);
});

export default app;

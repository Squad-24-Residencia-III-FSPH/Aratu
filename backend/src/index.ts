import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Carrega as variáveis de ambiente (como a do banco de dados)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares essenciais
app.use(cors()); // Permite que o front-end faça requisições para o back-end
app.use(express.json()); // Permite que o back-end entenda requisições no formato JSON

// Rota de teste
app.get('/', (req: Request, res: Response) => {
  res.json({ mensagem: 'Servidor Express rodando com sucesso no Docker!' });
});

// Iniciando o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  initDb,
  getClientes,
  addCliente,
  updateCliente,
  deleteCliente,
  getAeronaves,
  getAeronaveById,
  addAeronave,
  updateAeronave,
  deleteAeronave,
  getHistoricoVoos,
  addVoo,
  deleteVoo,
  getComponentes,
  addComponente,
  updateComponente,
  deleteComponente,
  getRevisoes,
  addRevisao,
  deleteRevisao,
  getDbConnectionStatus,
  reconfigureAndInitDb
} from './src/server/db.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Habilitar JSON de alta capacidade para suportar anexos em Base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Inicializar Banco de dados
  await initDb();

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    const dbStatus = getDbConnectionStatus();
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      database: dbStatus
    });
  });

  // Reconfigurar conexão do banco em tempo de execução
  app.post('/api/config-database', async (req, res) => {
    const { databaseUrl } = req.body;
    if (!databaseUrl) {
      return res.status(400).json({ success: false, error: 'A URL de conexão (databaseUrl) é obrigatória.' });
    }
    
    try {
      await reconfigureAndInitDb(databaseUrl);
      res.json({ success: true, message: 'Banco de dados configurado e tabelas inicializadas com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Erro ao reconfigurar banco de dados.' });
    }
  });

  // Login da aplicação
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Verifica se é administrador
    if (cleanEmail === 'lucastrombeta@gmail.com' && password === 'admin123') {
      return res.json({
        success: true,
        role: 'admin',
        user: {
          id: 'admin',
          nome: 'Lucas Trombeta (Admin)',
          email: 'lucastrombeta@gmail.com',
          documento: 'Administrador'
        }
      });
    }

    // 2. Busca na base de clientes
    try {
      const clientes = await getClientes();
      const matchedClient = clientes.find(
        c => c.email.trim().toLowerCase() === cleanEmail && (c.senha || '') === password
      );

      if (matchedClient) {
        return res.json({
          success: true,
          role: 'cliente',
          user: matchedClient
        });
      }

      res.status(401).json({ success: false, error: 'E-mail ou senha inválidos.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Erro ao autenticar usuário no banco de dados. Verifique a conexão com o banco.' });
    }
  });

  // --- CLIENTES ---
  app.get('/api/clientes', async (req, res) => {
    try {
      const list = await getClientes();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/clientes', async (req, res) => {
    try {
      const cliente = req.body;
      if (!cliente.id) cliente.id = 'cli_' + Math.random().toString(36).substr(2, 9);
      const created = await addCliente(cliente);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/clientes', async (req, res) => {
    try {
      const cliente = req.body;
      const updated = await updateCliente(cliente);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/clientes/:id', async (req, res) => {
    try {
      await deleteCliente(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- AERONAVES ---
  app.get('/api/aeronaves', async (req, res) => {
    try {
      const clienteId = req.query.clienteId as string;
      const list = await getAeronaves(clienteId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/aeronaves/:id', async (req, res) => {
    try {
      const aero = await getAeronaveById(req.params.id);
      if (!aero) return res.status(404).json({ error: 'Aeronave não encontrada' });
      res.json(aero);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/aeronaves', async (req, res) => {
    try {
      const aero = req.body;
      if (!aero.id) aero.id = 'aer_' + Math.random().toString(36).substr(2, 9);
      if (typeof aero.horasTotais !== 'number') aero.horasTotais = 0;
      if (typeof aero.ano !== 'number') aero.ano = Number(aero.ano || new Date().getFullYear());
      const created = await addAeronave(aero);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/aeronaves', async (req, res) => {
    try {
      const aero = req.body;
      if (typeof aero.horasTotais !== 'number') aero.horasTotais = Number(aero.horasTotais || 0);
      if (typeof aero.ano !== 'number') aero.ano = Number(aero.ano || new Date().getFullYear());
      const updated = await updateAeronave(aero);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/aeronaves/:id', async (req, res) => {
    try {
      await deleteAeronave(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- HISTÓRICO DE VOOS ---
  app.get('/api/historico', async (req, res) => {
    try {
      const aeronaveId = req.query.aeronaveId as string;
      const list = await getHistoricoVoos(aeronaveId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/historico', async (req, res) => {
    try {
      const voo = req.body;
      if (!voo.id) voo.id = 'voo_' + Math.random().toString(36).substr(2, 9);
      voo.horasVoo = Number(voo.horasVoo || 0);
      const created = await addVoo(voo);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/historico/:id', async (req, res) => {
    try {
      await deleteVoo(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- COMPONENTES CONTROLADOS ---
  app.get('/api/componentes', async (req, res) => {
    try {
      const aeronaveId = req.query.aeronaveId as string;
      const list = await getComponentes(aeronaveId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/componentes', async (req, res) => {
    try {
      const comp = req.body;
      if (!comp.id) comp.id = 'cmp_' + Math.random().toString(36).substr(2, 9);
      comp.limiteHoras = Number(comp.limiteHoras || 0);
      comp.limiteDias = Number(comp.limiteDias || 0);
      comp.horasInstalacao = Number(comp.horasInstalacao || 0);
      comp.ultimaRevisaoHoras = Number(comp.ultimaRevisaoHoras || 0);
      const created = await addComponente(comp);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/componentes', async (req, res) => {
    try {
      const comp = req.body;
      comp.limiteHoras = Number(comp.limiteHoras || 0);
      comp.limiteDias = Number(comp.limiteDias || 0);
      comp.horasInstalacao = Number(comp.horasInstalacao || 0);
      comp.ultimaRevisaoHoras = Number(comp.ultimaRevisaoHoras || 0);
      const updated = await updateComponente(comp);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/componentes/:id', async (req, res) => {
    try {
      await deleteComponente(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- LAUDOS E INSREÇÕES ---
  app.get('/api/revisoes', async (req, res) => {
    try {
      const aeronaveId = req.query.aeronaveId as string;
      const list = await getRevisoes(aeronaveId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/revisoes', async (req, res) => {
    try {
      const rev = req.body;
      if (!rev.id) rev.id = 'rev_' + Math.random().toString(36).substr(2, 9);
      rev.horasNaRevisao = Number(rev.horasNaRevisao || 0);
      const created = await addRevisao(rev);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/revisoes/:id', async (req, res) => {
    try {
      await deleteRevisao(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

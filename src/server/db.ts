import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { Cliente, Aeronave, HistoricoVoo, ComponenteControlado, RevisaoLaudo } from '../types';

let pool: Pool | null = null;
let dbConnectionError: string | null = null;

const CONFIG_FILE_PATH = path.join(process.cwd(), 'db-config.json');

// Função auxiliar para carregar a URL dinâmica se gravada
function getActiveDatabaseUrl(): string | undefined {
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.databaseUrl) {
        return parsed.databaseUrl;
      }
    } catch (e) {
      console.error('Erro ao ler db-config.json:', e);
    }
  }
  return process.env.DATABASE_URL;
}

function getPoolConfig(customUrl?: string) {
  const activeUrl = customUrl || getActiveDatabaseUrl();
  const pgHost = process.env.PGHOST || process.env.POSTGRES_HOST;
  
  if (activeUrl) {
    return { connectionString: activeUrl };
  }
  
  return {
    host: pgHost,
    user: process.env.PGUSER || process.env.POSTGRES_USER,
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'postgres',
    port: parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10),
    ssl: process.env.PGSSL === 'true' || activeUrl?.includes('ssl') ? { rejectUnauthorized: false } : undefined
  };
}

function setupPool(customUrl?: string) {
  try {
    if (pool) {
      pool.end().catch(() => {});
    }
    const config = getPoolConfig(customUrl);
    pool = new Pool({
      ...config,
      max: 15,
      idleTimeoutMillis: 30005,
      connectionTimeoutMillis: 5000,
    });
    dbConnectionError = null;
    console.log('PostgreSQL Pool configurado dinamicamente com sucesso.');
  } catch (err: any) {
    dbConnectionError = err?.message || String(err);
    console.error('Falha ao configurar Pool do PostgreSQL:', err);
  }
}

// Inicialização inicial do Pool principal
const initialUrl = getActiveDatabaseUrl();
const initialPgHost = process.env.PGHOST || process.env.POSTGRES_HOST;

if (initialUrl || initialPgHost) {
  setupPool();
} else {
  dbConnectionError = 'Variáveis de ambiente de banco de dados (DATABASE_URL ou PGHOST) não configuradas no sistema.';
  console.error(dbConnectionError);
}

// Para reconfigurar o banco em tempo de execução via tela de erro
export async function reconfigureAndInitDb(newUrl: string): Promise<void> {
  if (!newUrl || (!newUrl.startsWith('postgres://') && !newUrl.startsWith('postgresql://'))) {
    throw new Error('A URL de conexão deve iniciar com postgres:// ou postgresql://');
  }

  // Tenta conectar usando um pool temporário de validação
  const testPool = new Pool({
    connectionString: newUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await testPool.connect();
    client.release();
  } catch (err: any) {
    throw new Error(`Falha ao conectar com essa URL na base de dados: ${err.message}`);
  } finally {
    await testPool.end().catch(() => {});
  }

  // Grava a URL no arquivo local se funcionar
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify({ databaseUrl: newUrl }, null, 2), 'utf8');
  } catch (err: any) {
    throw new Error(`Não foi possível salvar o arquivo de configuração db-config.json: ${err.message}`);
  }

  // Recria o pool principal
  setupPool(newUrl);

  // Inicializa tabelas
  await initDb();
}

// Para exportarmos o estado do banco
export function getDbConnectionStatus() {
  if (dbConnectionError) {
    return { connected: false, error: dbConnectionError };
  }
  if (!pool) {
    return { connected: false, error: 'Database Pool não inicializado.' };
  }
  return { connected: true, error: null };
}

export function setDbConnectionError(err: string | null) {
  dbConnectionError = err;
}

function checkPool(): Pool {
  if (dbConnectionError) {
    throw new Error(dbConnectionError);
  }
  if (!pool) {
    throw new Error('O pool de conexão ao banco de dados não foi inicializado.');
  }
  return pool;
}

// Inicializa tabelas no PostgreSQL
export async function initDb() {
  if (dbConnectionError) {
    console.warn('Pulando initDb devido ao erro de configuração inicial do pool.');
    return;
  }
  if (!pool) {
    dbConnectionError = 'PostgreSQL Pool não configurado.';
    return;
  }
  
  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    dbConnectionError = 'Falha de Conexão com o Banco de Dados PostgreSQL: ' + (err?.message || String(err));
    console.error(dbConnectionError, err);
    return;
  }
  
  if (client) {
    try {
      console.log('Verificando/Criando tabelas no PostgreSQL...');
      
      // Criar tabelas se não existirem
      await client.query(`
        CREATE TABLE IF NOT EXISTS clientes (
          id VARCHAR(100) PRIMARY KEY,
          nome VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          telefone VARCHAR(50),
          documento VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS aeronaves (
          id VARCHAR(100) PRIMARY KEY,
          matricula VARCHAR(50) UNIQUE NOT NULL,
          modelo VARCHAR(100) NOT NULL,
          fabricante VARCHAR(100) NOT NULL,
          ano INTEGER,
          horas_totais DOUBLE PRECISION DEFAULT 0,
          cliente_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS historico_voos (
          id VARCHAR(100) PRIMARY KEY,
          aeronave_id VARCHAR(100) NOT NULL,
          data VARCHAR(20) NOT NULL,
          horas_voo DOUBLE PRECISION NOT NULL,
          piloto VARCHAR(255),
          descricao TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_aeronave_voo FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS componentes (
          id VARCHAR(100) PRIMARY KEY,
          aeronave_id VARCHAR(100) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          part_number VARCHAR(100),
          serial_number VARCHAR(100),
          limite_horas DOUBLE PRECISION DEFAULT 0,
          limite_dias INTEGER DEFAULT 0,
          horas_instalacao DOUBLE PRECISION DEFAULT 0,
          data_instalacao VARCHAR(20),
          ultima_revisao_horas DOUBLE PRECISION DEFAULT 0,
          ultima_revisao_data VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_aeronave_comp FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS revisoes (
          id VARCHAR(100) PRIMARY KEY,
          aeronave_id VARCHAR(100) NOT NULL,
          componente_id VARCHAR(100),
          data VARCHAR(20) NOT NULL,
          horas_na_revisao DOUBLE PRECISION NOT NULL,
          descricao TEXT,
          tipo VARCHAR(50) DEFAULT 'periodica',
          nome_anexo VARCHAR(255),
          dados_anexo TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_aeronave_rev FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id) ON DELETE CASCADE,
          CONSTRAINT fk_componente_rev FOREIGN KEY (componente_id) REFERENCES componentes(id) ON DELETE SET NULL
        );
      `);
      console.log('Tabelas PostgreSQL inicializadas com sucesso.');
      dbConnectionError = null; // Limpa qualquer erro anterior de conexão
    } catch (err: any) {
      dbConnectionError = 'Falha ao inicializar tabelas no PostgreSQL: ' + (err?.message || String(err));
      console.error(dbConnectionError, err);
    } finally {
      client.release();
    }
  }
}

// GERENCIAMENTO DE CLIENTES
export async function getClientes(): Promise<Cliente[]> {
  try {
    const p = checkPool();
    const res = await p.query('SELECT * FROM clientes ORDER BY nome ASC');
    return res.rows.map(row => ({
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      documento: row.documento,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de clientes: ' + err.message);
    throw err;
  }
}

export async function addCliente(cliente: Cliente): Promise<Cliente> {
  try {
    const p = checkPool();
    const { id, nome, email, telefone, documento } = cliente;
    await p.query(
      'INSERT INTO clientes (id, nome, email, telefone, documento) VALUES ($1, $2, $3, $4, $5)',
      [id, nome, email, telefone, documento]
    );
    return cliente;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar cliente: ' + err.message);
    throw err;
  }
}

export async function updateCliente(cliente: Cliente): Promise<Cliente> {
  try {
    const p = checkPool();
    const { id, nome, email, telefone, documento } = cliente;
    await p.query(
      'UPDATE clientes SET nome = $1, email = $2, telefone = $3, documento = $4 WHERE id = $5',
      [nome, email, telefone, documento, id]
    );
    return cliente;
  } catch (err: any) {
    setDbConnectionError('Erro ao atualizar cliente: ' + err.message);
    throw err;
  }
}

export async function deleteCliente(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM clientes WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar cliente: ' + err.message);
    throw err;
  }
}

// GERENCIAMENTO DE AERONAVES
export async function getAeronaves(clienteId?: string): Promise<Aeronave[]> {
  try {
    const p = checkPool();
    let query = 'SELECT * FROM aeronaves';
    const params = [];
    if (clienteId) {
      query += ' WHERE cliente_id = $1';
      params.push(clienteId);
    }
    query += ' ORDER BY matricula ASC';
    const res = await p.query(query, params);
    return res.rows.map(row => ({
      id: row.id,
      matricula: row.matricula,
      modelo: row.modelo,
      fabricante: row.fabricante,
      ano: row.ano,
      horasTotais: Number(row.horas_totais),
      clienteId: row.cliente_id,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de aeronaves: ' + err.message);
    throw err;
  }
}

export async function getAeronaveById(id: string): Promise<Aeronave | null> {
  try {
    const p = checkPool();
    const res = await p.query('SELECT * FROM aeronaves WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      matricula: row.matricula,
      modelo: row.modelo,
      fabricante: row.fabricante,
      ano: row.ano,
      horasTotais: Number(row.horas_totais),
      clienteId: row.cliente_id,
      created_at: row.created_at
    };
  } catch (err: any) {
    setDbConnectionError('Erro ao buscar aeronave por id: ' + err.message);
    throw err;
  }
}

export async function addAeronave(aeronave: Aeronave): Promise<Aeronave> {
  try {
    const p = checkPool();
    const { id, matricula, modelo, fabricante, ano, horasTotais, clienteId } = aeronave;
    await p.query(
      'INSERT INTO aeronaves (id, matricula, modelo, fabricante, ano, horas_totais, cliente_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, matricula, modelo, fabricante, ano, horasTotais, clienteId]
    );
    return aeronave;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar aeronave: ' + err.message);
    throw err;
  }
}

export async function updateAeronave(aeronave: Aeronave): Promise<Aeronave> {
  try {
    const p = checkPool();
    const { id, matricula, modelo, fabricante, ano, horasTotais, clienteId } = aeronave;
    await p.query(
      'UPDATE aeronaves SET matricula = $1, modelo = $2, fabricante = $3, ano = $4, horas_totais = $5, cliente_id = $6 WHERE id = $7',
      [matricula, modelo, fabricante, ano, horasTotais, clienteId, id]
    );
    return aeronave;
  } catch (err: any) {
    setDbConnectionError('Erro ao atualizar aeronave: ' + err.message);
    throw err;
  }
}

export async function deleteAeronave(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM aeronaves WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar aeronave: ' + err.message);
    throw err;
  }
}

// HISTÓRICO DE VOOS
export async function getHistoricoVoos(aeronaveId?: string): Promise<HistoricoVoo[]> {
  try {
    const p = checkPool();
    let query = 'SELECT * FROM historico_voos';
    const params = [];
    if (aeronaveId) {
      query += ' WHERE aeronave_id = $1';
      params.push(aeronaveId);
    }
    query += ' ORDER BY data DESC, created_at DESC';
    const res = await p.query(query, params);
    return res.rows.map(row => ({
      id: row.id,
      aeronaveId: row.aeronave_id,
      data: row.data,
      horasVoo: Number(row.horas_voo),
      piloto: row.piloto,
      descricao: row.descricao,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de histórico de voos: ' + err.message);
    throw err;
  }
}

export async function addVoo(voo: HistoricoVoo): Promise<HistoricoVoo> {
  try {
    const p = checkPool();
    const { id, aeronaveId, data, horasVoo, piloto, descricao } = voo;
    
    // Inserir voo
    await p.query(
      'INSERT INTO historico_voos (id, aeronave_id, data, horas_voo, piloto, descricao) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, aeronaveId, data, horasVoo, piloto, descricao]
    );
    
    // Atualizar horas totais da aeronave
    await p.query(
      'UPDATE aeronaves SET horas_totais = horas_totais + $1 WHERE id = $2',
      [horasVoo, aeronaveId]
    );
    
    return voo;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar voo: ' + err.message);
    throw err;
  }
}

export async function deleteVoo(id: string): Promise<void> {
  try {
    const p = checkPool();
    // Buscar voo para subtrair as horas
    const vooRes = await p.query('SELECT aeronave_id, horas_voo FROM historico_voos WHERE id = $1', [id]);
    if (vooRes.rows.length > 0) {
      const { aeronave_id, horas_voo } = vooRes.rows[0];
      await p.query('DELETE FROM historico_voos WHERE id = $1', [id]);
      await p.query(
        'UPDATE aeronaves SET horas_totais = GREATEST(0, horas_totais - $1) WHERE id = $2',
        [horas_voo, aeronave_id]
      );
    }
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar voo: ' + err.message);
    throw err;
  }
}

// COMPONENTES CONTROLADOS
export async function getComponentes(aeronaveId?: string): Promise<ComponenteControlado[]> {
  try {
    const p = checkPool();
    let query = 'SELECT * FROM componentes';
    const params = [];
    if (aeronaveId) {
      query += ' WHERE aeronave_id = $1';
      params.push(aeronaveId);
    }
    query += ' ORDER BY nome ASC';
    const res = await p.query(query, params);
    return res.rows.map(row => ({
      id: row.id,
      aeronaveId: row.aeronave_id,
      nome: row.nome,
      partNumber: row.part_number,
      serialNumber: row.serial_number,
      limiteHoras: Number(row.limite_horas),
      limiteDias: Number(row.limite_dias),
      horasInstalacao: Number(row.horas_instalacao),
      dataInstalacao: row.data_instalacao,
      ultimaRevisaoHoras: Number(row.ultima_revisao_horas),
      ultimaRevisaoData: row.ultima_revisao_data,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de componentes: ' + err.message);
    throw err;
  }
}

export async function addComponente(comp: ComponenteControlado): Promise<ComponenteControlado> {
  try {
    const p = checkPool();
    const { id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData } = comp;
    await p.query(
      `INSERT INTO componentes (id, aeronave_id, nome, part_number, serial_number, limite_horas, limite_dias, horas_instalacao, data_instalacao, ultima_revisao_horas, ultima_revisao_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData]
    );
    return comp;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar componente: ' + err.message);
    throw err;
  }
}

export async function updateComponente(comp: ComponenteControlado): Promise<ComponenteControlado> {
  try {
    const p = checkPool();
    const { id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData } = comp;
    await p.query(
      `UPDATE componentes SET aeronave_id = $1, nome = $2, part_number = $3, serial_number = $4, limite_horas = $5, limite_dias = $6, horas_instalacao = $7, data_instalacao = $8, ultima_revisao_horas = $9, ultima_revisao_data = $10 WHERE id = $11`,
      [aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData, id]
    );
    return comp;
  } catch (err: any) {
    setDbConnectionError('Erro ao atualizar componente: ' + err.message);
    throw err;
  }
}

export async function deleteComponente(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM componentes WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar componente: ' + err.message);
    throw err;
  }
}

// LAUDOS E REVISÕES
export async function getRevisoes(aeronaveId?: string): Promise<RevisaoLaudo[]> {
  try {
    const p = checkPool();
    let query = 'SELECT * FROM revisoes';
    const params = [];
    if (aeronaveId) {
      query += ' WHERE aeronave_id = $1';
      params.push(aeronaveId);
    }
    query += ' ORDER BY data DESC, created_at DESC';
    const res = await p.query(query, params);
    return res.rows.map(row => ({
      id: row.id,
      aeronaveId: row.aeronave_id,
      componenteId: row.componente_id || undefined,
      data: row.data,
      horasNaRevisao: Number(row.horas_na_revisao),
      descricao: row.descricao,
      tipo: row.tipo as any,
      nomeAnexo: row.nome_anexo || undefined,
      dadosAnexo: row.dados_anexo || undefined,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de revisões: ' + err.message);
    throw err;
  }
}

export async function addRevisao(rev: RevisaoLaudo): Promise<RevisaoLaudo> {
  try {
    const p = checkPool();
    const { id, aeronaveId, componenteId, data, horasNaRevisao, descricao, tipo, nomeAnexo, dadosAnexo } = rev;
    await p.query(
      `INSERT INTO revisoes (id, aeronave_id, componente_id, data, horas_na_revisao, descricao, tipo, nome_anexo, dados_anexo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, aeronaveId, componenteId || null, data, horasNaRevisao, descricao, tipo, nomeAnexo || null, dadosAnexo || null]
    );

    // Se a revisão foi em um componente específico, atualiza suas datas de última revisão
    if (componenteId) {
      await p.query(
        `UPDATE componentes SET ultima_revisao_horas = $1, ultima_revisao_data = $2 WHERE id = $3`,
        [horasNaRevisao, data, componenteId]
      );
    }
    
    return rev;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar revisão: ' + err.message);
    throw err;
  }
}

export async function deleteRevisao(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM revisoes WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar revisão: ' + err.message);
    throw err;
  }
}

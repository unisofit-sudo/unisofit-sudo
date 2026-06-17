import { Client, Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { Cliente, Aeronave, HistoricoVoo, ComponenteControlado, RevisaoLaudo } from '../types';

// Caminho para o banco local de backup/fallback
const LOCAL_DB_PATH = path.join(process.cwd(), 'database-local.json');

// Interface para a estrutura do banco em arquivo JSON (para o fallback na AI Studio)
interface LocalSchema {
  clientes: Cliente[];
  aeronaves: Aeronave[];
  historicoVoos: HistoricoVoo[];
  componentes: ComponenteControlado[];
  revisoes: RevisaoLaudo[];
}

const DEFAULT_SCHEMA: LocalSchema = {
  clientes: [],
  aeronaves: [],
  historicoVoos: [],
  componentes: [],
  revisoes: [],
};

let pool: Pool | null = null;
let useLocalDb = true;

// Determina se devemos usar PostgreSQL ou fallback local
const dbUrl = process.env.DATABASE_URL;
const pgHost = process.env.PGHOST || process.env.POSTGRES_HOST;

if (dbUrl || pgHost) {
  try {
    const config = dbUrl ? { connectionString: dbUrl } : {
      host: pgHost,
      user: process.env.PGUSER || process.env.POSTGRES_USER,
      password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
      database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'postgres',
      port: parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10),
      ssl: process.env.PGSSL === 'true' || dbUrl?.includes('ssl') ? { rejectUnauthorized: false } : undefined
    };
    
    pool = new Pool({
      ...config,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    useLocalDb = false;
    console.log('PostgreSQL Pool configurado com sucesso.');
  } catch (err) {
    console.error('Falha ao configurar Pool do PostgreSQL, usando banco de dados local por padrão:', err);
    useLocalDb = true;
  }
} else {
  console.log('Nenhuma credencial do PostgreSQL encontrada. Usando banco de dados local no arquivo "database-local.json".');
  useLocalDb = true;
}

// Inicializa tabelas no PostgreSQL ou arquivo local
export async function initDb() {
  if (!useLocalDb && pool) {
    try {
      const client = await pool.connect();
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
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Erro ao conectar ao PostgreSQL, trocando para banco local temporário:', err);
      useLocalDb = true;
      initLocalFile();
    }
  } else {
    initLocalFile();
  }
}

function initLocalFile() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(DEFAULT_SCHEMA, null, 2), 'utf8');
    console.log('Arquivo database-local.json criado.');
  } else {
    try {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
      JSON.parse(data);
      console.log('Banco de dados local em database-local.json carregado com sucesso.');
    } catch (e) {
      console.warn('Erro ao ler arquivo local existente. Reiniciando-o.');
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(DEFAULT_SCHEMA, null, 2), 'utf8');
    }
  }
}

// Helpers para leitura e escrita no arquivo JSON local
function readLocalDb(): LocalSchema {
  try {
    const data = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return DEFAULT_SCHEMA;
  }
}

function writeLocalDb(data: LocalSchema) {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GERENCIAMENTO DE CLIENTES
export async function getClientes(): Promise<Cliente[]> {
  if (!useLocalDb && pool) {
    const res = await pool.query('SELECT * FROM clientes ORDER BY nome ASC');
    return res.rows.map(row => ({
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      documento: row.documento,
      created_at: row.created_at
    }));
  } else {
    return readLocalDb().clientes;
  }
}

export async function addCliente(cliente: Cliente): Promise<Cliente> {
  if (!useLocalDb && pool) {
    const { id, nome, email, telefone, documento } = cliente;
    await pool.query(
      'INSERT INTO clientes (id, nome, email, telefone, documento) VALUES ($1, $2, $3, $4, $5)',
      [id, nome, email, telefone, documento]
    );
    return cliente;
  } else {
    const db = readLocalDb();
    db.clientes.push(cliente);
    writeLocalDb(db);
    return cliente;
  }
}

export async function updateCliente(cliente: Cliente): Promise<Cliente> {
  if (!useLocalDb && pool) {
    const { id, nome, email, telefone, documento } = cliente;
    await pool.query(
      'UPDATE clientes SET nome = $1, email = $2, telefone = $3, documento = $4 WHERE id = $5',
      [nome, email, telefone, documento, id]
    );
    return cliente;
  } else {
    const db = readLocalDb();
    const idx = db.clientes.findIndex(c => c.id === cliente.id);
    if (idx !== -1) {
      db.clientes[idx] = { ...db.clientes[idx], ...cliente };
      writeLocalDb(db);
    }
    return cliente;
  }
}

export async function deleteCliente(id: string): Promise<void> {
  if (!useLocalDb && pool) {
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
  } else {
    const db = readLocalDb();
    db.clientes = db.clientes.filter(c => c.id !== id);
    db.aeronaves = db.aeronaves.filter(a => a.clienteId !== id);
    writeLocalDb(db);
  }
}

// GERENCIAMENTO DE AERONAVES
export async function getAeronaves(clienteId?: string): Promise<Aeronave[]> {
  if (!useLocalDb && pool) {
    let query = 'SELECT * FROM aeronaves';
    const params = [];
    if (clienteId) {
      query += ' WHERE cliente_id = $1';
      params.push(clienteId);
    }
    query += ' ORDER BY matricula ASC';
    const res = await pool.query(query, params);
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
  } else {
    const db = readLocalDb();
    return clienteId ? db.aeronaves.filter(a => a.clienteId === clienteId) : db.aeronaves;
  }
}

export async function getAeronaveById(id: string): Promise<Aeronave | null> {
  if (!useLocalDb && pool) {
    const res = await pool.query('SELECT * FROM aeronaves WHERE id = $1', [id]);
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
  } else {
    const db = readLocalDb();
    return db.aeronaves.find(a => a.id === id) || null;
  }
}

export async function addAeronave(aeronave: Aeronave): Promise<Aeronave> {
  if (!useLocalDb && pool) {
    const { id, matricula, modelo, fabricante, ano, horasTotais, clienteId } = aeronave;
    await pool.query(
      'INSERT INTO aeronaves (id, matricula, modelo, fabricante, ano, horas_totais, cliente_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, matricula, modelo, fabricante, ano, horasTotais, clienteId]
    );
    return aeronave;
  } else {
    const db = readLocalDb();
    db.aeronaves.push(aeronave);
    writeLocalDb(db);
    return aeronave;
  }
}

export async function updateAeronave(aeronave: Aeronave): Promise<Aeronave> {
  if (!useLocalDb && pool) {
    const { id, matricula, modelo, fabricante, ano, horasTotais, clienteId } = aeronave;
    await pool.query(
      'UPDATE aeronaves SET matricula = $1, modelo = $2, fabricante = $3, ano = $4, horas_totais = $5, cliente_id = $6 WHERE id = $7',
      [matricula, modelo, fabricante, ano, horasTotais, clienteId, id]
    );
    return aeronave;
  } else {
    const db = readLocalDb();
    const idx = db.aeronaves.findIndex(a => a.id === aeronave.id);
    if (idx !== -1) {
      db.aeronaves[idx] = { ...db.aeronaves[idx], ...aeronave };
      writeLocalDb(db);
    }
    return aeronave;
  }
}

export async function deleteAeronave(id: string): Promise<void> {
  if (!useLocalDb && pool) {
    await pool.query('DELETE FROM aeronaves WHERE id = $1', [id]);
  } else {
    const db = readLocalDb();
    db.aeronaves = db.aeronaves.filter(a => a.id !== id);
    db.historicoVoos = db.historicoVoos.filter(v => v.aeronaveId !== id);
    db.componentes = db.componentes.filter(c => c.aeronaveId !== id);
    db.revisoes = db.revisoes.filter(r => r.aeronaveId !== id);
    writeLocalDb(db);
  }
}

// HISTÓRICO DE VOOS
export async function getHistoricoVoos(aeronaveId?: string): Promise<HistoricoVoo[]> {
  if (!useLocalDb && pool) {
    let query = 'SELECT * FROM historico_voos';
    const params = [];
    if (aeronaveId) {
      query += ' WHERE aeronave_id = $1';
      params.push(aeronaveId);
    }
    query += ' ORDER BY data DESC, created_at DESC';
    const res = await pool.query(query, params);
    return res.rows.map(row => ({
      id: row.id,
      aeronaveId: row.aeronave_id,
      data: row.data,
      horasVoo: Number(row.horas_voo),
      piloto: row.piloto,
      descricao: row.descricao,
      created_at: row.created_at
    }));
  } else {
    const db = readLocalDb();
    const list = aeronaveId ? db.historicoVoos.filter(v => v.aeronaveId === aeronaveId) : db.historicoVoos;
    return list.sort((a, b) => b.data.localeCompare(a.data));
  }
}

export async function addVoo(voo: HistoricoVoo): Promise<HistoricoVoo> {
  if (!useLocalDb && pool) {
    const { id, aeronaveId, data, horasVoo, piloto, descricao } = voo;
    
    // Inserir voo
    await pool.query(
      'INSERT INTO historico_voos (id, aeronave_id, data, horas_voo, piloto, descricao) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, aeronaveId, data, horasVoo, piloto, descricao]
    );
    
    // Atualizar horas totais da aeronave
    await pool.query(
      'UPDATE aeronaves SET horas_totais = horas_totais + $1 WHERE id = $2',
      [horasVoo, aeronaveId]
    );
    
    return voo;
  } else {
    const db = readLocalDb();
    db.historicoVoos.push(voo);
    
    // Atualiza aeronave
    const aIdx = db.aeronaves.findIndex(a => a.id === voo.aeronaveId);
    if (aIdx !== -1) {
      db.aeronaves[aIdx].horasTotais += voo.horasVoo;
    }
    
    writeLocalDb(db);
    return voo;
  }
}

export async function deleteVoo(id: string): Promise<void> {
  if (!useLocalDb && pool) {
    // Buscar voo para subtrair as horas
    const vooRes = await pool.query('SELECT aeronave_id, horas_voo FROM historico_voos WHERE id = $1', [id]);
    if (vooRes.rows.length > 0) {
      const { aeronave_id, horas_voo } = vooRes.rows[0];
      await pool.query('DELETE FROM historico_voos WHERE id = $1', [id]);
      await pool.query(
        'UPDATE aeronaves SET horas_totais = GREATEST(0, horas_totais - $1) WHERE id = $2',
        [horas_voo, aeronave_id]
      );
    }
  } else {
    const db = readLocalDb();
    const vooIdx = db.historicoVoos.findIndex(v => v.id === id);
    if (vooIdx !== -1) {
      const voo = db.historicoVoos[vooIdx];
      db.historicoVoos.splice(vooIdx, 1);
      
      const aIdx = db.aeronaves.findIndex(a => a.id === voo.aeronaveId);
      if (aIdx !== -1) {
        db.aeronaves[aIdx].horasTotais = Math.max(0, db.aeronaves[aIdx].horasTotais - voo.horasVoo);
      }
      writeLocalDb(db);
    }
  }
}

// COMPONENTES CONTROLADOS
export async function getComponentes(aeronaveId?: string): Promise<ComponenteControlado[]> {
  if (!useLocalDb && pool) {
    let query = 'SELECT * FROM componentes';
    const params = [];
    if (aeronaveId) {
      query += ' WHERE aeronave_id = $1';
      params.push(aeronaveId);
    }
    query += ' ORDER BY nome ASC';
    const res = await pool.query(query, params);
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
  } else {
    const db = readLocalDb();
    return aeronaveId ? db.componentes.filter(c => c.aeronaveId === aeronaveId) : db.componentes;
  }
}

export async function addComponente(comp: ComponenteControlado): Promise<ComponenteControlado> {
  if (!useLocalDb && pool) {
    const { id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData } = comp;
    await pool.query(
      `INSERT INTO componentes (id, aeronave_id, nome, part_number, serial_number, limite_horas, limite_dias, horas_instalacao, data_instalacao, ultima_revisao_horas, ultima_revisao_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData]
    );
    return comp;
  } else {
    const db = readLocalDb();
    db.componentes.push(comp);
    writeLocalDb(db);
    return comp;
  }
}

export async function updateComponente(comp: ComponenteControlado): Promise<ComponenteControlado> {
  if (!useLocalDb && pool) {
    const { id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData } = comp;
    await pool.query(
      `UPDATE componentes SET aeronave_id = $1, nome = $2, part_number = $3, serial_number = $4, limite_horas = $5, limite_dias = $6, horas_instalacao = $7, data_instalacao = $8, ultima_revisao_horas = $9, ultima_revisao_data = $10 WHERE id = $11`,
      [aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData, id]
    );
    return comp;
  } else {
    const db = readLocalDb();
    const idx = db.componentes.findIndex(c => c.id === comp.id);
    if (idx !== -1) {
      db.componentes[idx] = { ...db.componentes[idx], ...comp };
      writeLocalDb(db);
    }
    return comp;
  }
}

export async function deleteComponente(id: string): Promise<void> {
  if (!useLocalDb && pool) {
    await pool.query('DELETE FROM componentes WHERE id = $1', [id]);
  } else {
    const db = readLocalDb();
    db.componentes = db.componentes.filter(c => c.id !== id);
    db.revisoes = db.revisoes.map(r => r.componenteId === id ? { ...r, componenteId: undefined } : r);
    writeLocalDb(db);
  }
}

// LAUDOS E REVISÕES
export async function getRevisoes(aeronaveId?: string): Promise<RevisaoLaudo[]> {
  if (!useLocalDb && pool) {
    let query = 'SELECT * FROM revisoes';
    const params = [];
    if (aeronaveId) {
      query += ' WHERE aeronave_id = $1';
      params.push(aeronaveId);
    }
    query += ' ORDER BY data DESC, created_at DESC';
    const res = await pool.query(query, params);
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
  } else {
    const db = readLocalDb();
    const list = aeronaveId ? db.revisoes.filter(r => r.aeronaveId === aeronaveId) : db.revisoes;
    return list.sort((a, b) => b.data.localeCompare(a.data));
  }
}

export async function addRevisao(rev: RevisaoLaudo): Promise<RevisaoLaudo> {
  if (!useLocalDb && pool) {
    const { id, aeronaveId, componenteId, data, horasNaRevisao, descricao, tipo, nomeAnexo, dadosAnexo } = rev;
    await pool.query(
      `INSERT INTO revisoes (id, aeronave_id, componente_id, data, horas_na_revisao, descricao, tipo, nome_anexo, dados_anexo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, aeronaveId, componenteId || null, data, horasNaRevisao, descricao, tipo, nomeAnexo || null, dadosAnexo || null]
    );

    // Se a revisão foi em um componente específico, atualiza suas datas de última revisão
    if (componenteId) {
      await pool.query(
        `UPDATE componentes SET ultima_revisao_horas = $1, ultima_revisao_data = $2 WHERE id = $3`,
        [horasNaRevisao, data, componenteId]
      );
    }
    
    return rev;
  } else {
    const db = readLocalDb();
    db.revisoes.push(rev);
    
    // Se for em componente, atualiza o componente
    if (rev.componenteId) {
      const cIdx = db.componentes.findIndex(c => c.id === rev.componenteId);
      if (cIdx !== -1) {
        db.componentes[cIdx].ultimaRevisaoHoras = rev.horasNaRevisao;
        db.componentes[cIdx].ultimaRevisaoData = rev.data;
      }
    }
    
    writeLocalDb(db);
    return rev;
  }
}

export async function deleteRevisao(id: string): Promise<void> {
  if (!useLocalDb && pool) {
    await pool.query('DELETE FROM revisoes WHERE id = $1', [id]);
  } else {
    const db = readLocalDb();
    db.revisoes = db.revisoes.filter(r => r.id !== id);
    writeLocalDb(db);
  }
}

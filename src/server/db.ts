import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { Cliente, Aeronave, HistoricoVoo, ComponenteControlado, InspecaoPeriodica, RevisaoLaudo, UsuarioOficina, UsuarioPiloto } from '../types';

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
          endereco TEXT,
          whatsapp VARCHAR(50),
          tipo_pessoa VARCHAR(20) DEFAULT 'PF',
          senha VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Garante suporte a evolução do schema caso a tabela já exista
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco TEXT;
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50);
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_pessoa VARCHAR(20) DEFAULT 'PF';
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS senha VARCHAR(255);
        
        CREATE TABLE IF NOT EXISTS aeronaves (
          id VARCHAR(100) PRIMARY KEY,
          matricula VARCHAR(50) UNIQUE NOT NULL,
          modelo VARCHAR(100) NOT NULL,
          fabricante VARCHAR(100) NOT NULL,
          ano INTEGER,
          horas_totais DOUBLE PRECISION DEFAULT 0,
          horas_motor DOUBLE PRECISION DEFAULT 0,
          horas_helice DOUBLE PRECISION DEFAULT 0,
          cliente_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );

        -- Garante evolução para aeronaves
        ALTER TABLE aeronaves ADD COLUMN IF NOT EXISTS horas_motor DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE aeronaves ADD COLUMN IF NOT EXISTS horas_helice DOUBLE PRECISION DEFAULT 0;
        
        CREATE TABLE IF NOT EXISTS historico_voos (
          id VARCHAR(100) PRIMARY KEY,
          aeronave_id VARCHAR(100) NOT NULL,
          data VARCHAR(20) NOT NULL,
          de VARCHAR(4),
          para VARCHAR(4),
          partida VARCHAR(5),
          decolagem VARCHAR(5),
          pouso VARCHAR(5),
          corte VARCHAR(5),
          pax INTEGER DEFAULT 0,
          pc INTEGER DEFAULT 0,
          canac VARCHAR(6),
          horas_voo DOUBLE PRECISION NOT NULL,
          piloto VARCHAR(255),
          descricao TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_aeronave_voo FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id) ON DELETE CASCADE
        );

        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS de VARCHAR(4);
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS para VARCHAR(4);
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS partida VARCHAR(5);
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS decolagem VARCHAR(5);
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS pouso VARCHAR(5);
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS corte VARCHAR(5);
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS pax INTEGER DEFAULT 0;
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS pc INTEGER DEFAULT 0;
        ALTER TABLE historico_voos ADD COLUMN IF NOT EXISTS canac VARCHAR(6);
        
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
          nome_anexo VARCHAR(255),
          dados_anexo TEXT,
          anexos TEXT,
          marca VARCHAR(255),
          condicao VARCHAR(50),
          oficina_executante VARCHAR(255),
          sistema VARCHAR(50) DEFAULT 'celula',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_aeronave_comp FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id) ON DELETE CASCADE
        );

        -- Garante suporte a evolução do schema caso a tabela já exista
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS nome_anexo VARCHAR(255);
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS dados_anexo TEXT;
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS anexos TEXT;
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS marca VARCHAR(255);
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS condicao VARCHAR(50);
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS oficina_executante VARCHAR(255);
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS sistema VARCHAR(50) DEFAULT 'celula';
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS horas_instalacao_motor DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE componentes ADD COLUMN IF NOT EXISTS horas_instalacao_helice DOUBLE PRECISION DEFAULT 0;
        
        -- Inicializa dados de migração para novos campos
        UPDATE componentes SET horas_instalacao_motor = horas_instalacao WHERE sistema = 'motor' AND (horas_instalacao_motor IS NULL OR horas_instalacao_motor = 0);
        UPDATE componentes SET horas_instalacao_helice = horas_instalacao WHERE sistema = 'helice' AND (horas_instalacao_helice IS NULL OR horas_instalacao_helice = 0);
        
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

        CREATE TABLE IF NOT EXISTS usuarios_oficina (
          id VARCHAR(100) PRIMARY KEY,
          cliente_id VARCHAR(100) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          senha VARCHAR(255) NOT NULL,
          tipo_prazo VARCHAR(50) DEFAULT 'indeterminado',
          prazo_acesso VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_cliente_oficina FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS usuarios_pilotos (
          id VARCHAR(100) PRIMARY KEY,
          cliente_id VARCHAR(100) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          senha VARCHAR(255) NOT NULL,
          canac VARCHAR(6),
          tipo_prazo VARCHAR(50) DEFAULT 'indeterminado',
          prazo_acesso VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_cliente_piloto FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );

        ALTER TABLE usuarios_pilotos ALTER COLUMN email DROP NOT NULL;
        ALTER TABLE usuarios_pilotos DROP CONSTRAINT IF EXISTS usuarios_pilotos_email_key;

        CREATE TABLE IF NOT EXISTS inspecoes_periodicas (
          id VARCHAR(100) PRIMARY KEY,
          aeronave_id VARCHAR(100) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          sistema VARCHAR(50) DEFAULT 'celula',
          conteudo TEXT,
          observacao TEXT,
          limite_horas DOUBLE PRECISION DEFAULT 0,
          limite_dias INTEGER DEFAULT 0,
          data_realizacao VARCHAR(20),
          horas_celula_na_inspecao DOUBLE PRECISION DEFAULT 0,
          horas_motor_na_inspecao DOUBLE PRECISION DEFAULT 0,
          oficina_executante VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_aeronave_insp FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id) ON DELETE CASCADE
        );

        -- Executa migrações automáticas de dados dos componentes para representação direta
        -- 1. Para componentes com revisões registradas (onde ultima_revisao_horas > horas_instalacao)
        UPDATE componentes 
        SET horas_instalacao = ultima_revisao_horas, ultima_revisao_horas = 0 
        WHERE ultima_revisao_horas > horas_instalacao;

        -- 2. Para componentes novos
        UPDATE componentes 
        SET ultima_revisao_horas = 0 
        WHERE condicao = 'novo' AND ultima_revisao_horas = horas_instalacao AND horas_instalacao > 0;

        -- 3. Para componentes overhaul
        UPDATE componentes 
        SET ultima_revisao_horas = horas_instalacao - ultima_revisao_horas 
        WHERE condicao = 'overhaul' AND ultima_revisao_horas > 0 AND ultima_revisao_horas <= horas_instalacao AND horas_instalacao > 0;
      `);
      console.log('Tabelas PostgreSQL inicializadas com sucesso e migração de componentes finalizada.');
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
      endereco: row.endereco || '',
      whatsapp: row.whatsapp || '',
      tipoPessoa: (row.tipo_pessoa || 'PF') as 'PF' | 'PJ',
      senha: row.senha || '',
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
    const { id, nome, email, telefone, documento, endereco, whatsapp, tipoPessoa, senha } = cliente;
    await p.query(
      'INSERT INTO clientes (id, nome, email, telefone, documento, endereco, whatsapp, tipo_pessoa, senha) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, nome, email, telefone, documento, endereco || '', whatsapp || '', tipoPessoa || 'PF', senha || '']
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
    const { id, nome, email, telefone, documento, endereco, whatsapp, tipoPessoa, senha } = cliente;
    await p.query(
      'UPDATE clientes SET nome = $1, email = $2, telefone = $3, documento = $4, endereco = $5, whatsapp = $6, tipo_pessoa = $7, senha = $8 WHERE id = $9',
      [nome, email, telefone, documento, endereco || '', whatsapp || '', tipoPessoa || 'PF', senha || '', id]
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
      horasMotor: Number(row.horas_motor || 0),
      horasHelice: Number(row.horas_helice || 0),
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
      horasMotor: Number(row.horas_motor || 0),
      horasHelice: Number(row.horas_helice || 0),
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
    const { id, matricula, modelo, fabricante, ano, horasTotais, horasMotor, horasHelice, clienteId } = aeronave;
    await p.query(
      'INSERT INTO aeronaves (id, matricula, modelo, fabricante, ano, horas_totais, horas_motor, horas_helice, cliente_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, matricula, modelo, fabricante, ano, horasTotais, horasMotor || 0, horasHelice || 0, clienteId]
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
    const { id, matricula, modelo, fabricante, ano, horasTotais, horasMotor, horasHelice, clienteId } = aeronave;
    await p.query(
      'UPDATE aeronaves SET matricula = $1, modelo = $2, fabricante = $3, ano = $4, horas_totais = $5, horas_motor = $6, horas_helice = $7, cliente_id = $8 WHERE id = $9',
      [matricula, modelo, fabricante, ano, horasTotais, horasMotor || 0, horasHelice || 0, clienteId, id]
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
      de: row.de || undefined,
      para: row.para || undefined,
      partida: row.partida || undefined,
      decolagem: row.decolagem || undefined,
      pouso: row.pouso || undefined,
      corte: row.corte || undefined,
      pax: row.pax !== null && row.pax !== undefined ? Number(row.pax) : undefined,
      pc: row.pc !== null && row.pc !== undefined ? Number(row.pc) : undefined,
      canac: row.canac || undefined,
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
    const {
      id,
      aeronaveId,
      data,
      de,
      para,
      partida,
      decolagem,
      pouso,
      corte,
      pax,
      pc,
      canac,
      horasVoo,
      piloto,
      descricao
    } = voo;
    
    // Idempotência para sincronização offline: evita duplicar voo ou somar horas duas vezes
    const existing = await p.query('SELECT id FROM historico_voos WHERE id = $1', [id]);
    if (existing.rows.length > 0) {
      return voo;
    }

    // Inserir voo
    await p.query(
      `INSERT INTO historico_voos (id, aeronave_id, data, de, para, partida, decolagem, pouso, corte, pax, pc, canac, horas_voo, piloto, descricao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        aeronaveId,
        data,
        de || null,
        para || null,
        partida || null,
        decolagem || null,
        pouso || null,
        corte || null,
        pax !== undefined && pax !== null ? Number(pax) : 0,
        pc !== undefined && pc !== null ? Number(pc) : 0,
        canac || null,
        horasVoo,
        piloto,
        descricao
      ]
    );
    
    // Atualizar horas totais da aeronave (Partida -> Corte aplicado para Célula, Motor e Hélice)
    await p.query(
      'UPDATE aeronaves SET horas_totais = horas_totais + $1, horas_motor = horas_motor + $1, horas_helice = horas_helice + $1 WHERE id = $2',
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
        'UPDATE aeronaves SET horas_totais = GREATEST(0, horas_totais - $1), horas_motor = GREATEST(0, horas_motor - $1), horas_helice = GREATEST(0, horas_helice - $1) WHERE id = $2',
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
    return res.rows.map(row => {
      let anexosList: { nome: string; dados: string }[] = [];
      if (row.anexos) {
        try {
          const parsed = typeof row.anexos === 'string' ? JSON.parse(row.anexos) : row.anexos;
          if (Array.isArray(parsed)) {
            anexosList = parsed.filter((a: any) => a && a.nome && a.dados);
          }
        } catch {
          anexosList = [];
        }
      }
      if (anexosList.length === 0 && row.nome_anexo && row.dados_anexo) {
        anexosList = [{ nome: row.nome_anexo, dados: row.dados_anexo }];
      }

      return {
        id: row.id,
        aeronaveId: row.aeronave_id,
        nome: row.nome,
        partNumber: row.part_number,
        serialNumber: row.serial_number,
        limiteHoras: Number(row.limite_horas),
        limiteDias: Number(row.limite_dias),
        horasInstalacao: Number(row.horas_instalacao),
        horasInstalacaoMotor: Number(row.horas_instalacao_motor || 0),
        horasInstalacaoHelice: Number(row.horas_instalacao_helice || 0),
        dataInstalacao: row.data_instalacao,
        ultimaRevisaoHoras: Number(row.ultima_revisao_horas),
        ultimaRevisaoData: row.ultima_revisao_data,
        nomeAnexo: row.nome_anexo || (anexosList[0]?.nome ?? undefined),
        dadosAnexo: row.dados_anexo || (anexosList[0]?.dados ?? undefined),
        anexos: anexosList,
        marca: row.marca || undefined,
        condicao: (row.condicao as 'novo' | 'overhaul') || undefined,
        oficinaExecutante: row.oficina_executante || undefined,
        sistema: (row.sistema as 'celula' | 'motor' | 'helice') || 'celula',
        created_at: row.created_at
      };
    });
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de componentes: ' + err.message);
    throw err;
  }
}

export async function addComponente(comp: ComponenteControlado): Promise<ComponenteControlado> {
  try {
    const p = checkPool();
    const { id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, horasInstalacaoMotor, horasInstalacaoHelice, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData, nomeAnexo, dadosAnexo, anexos, marca, condicao, oficinaExecutante, sistema } = comp;
    const anexosList = Array.isArray(anexos)
      ? anexos.filter(a => a && a.nome && a.dados)
      : (nomeAnexo && dadosAnexo ? [{ nome: nomeAnexo, dados: dadosAnexo }] : []);
    const primaryNome = anexosList[0]?.nome || null;
    const primaryDados = anexosList[0]?.dados || null;
    const anexosJson = anexosList.length > 0 ? JSON.stringify(anexosList) : null;

    await p.query(
      `INSERT INTO componentes (id, aeronave_id, nome, part_number, serial_number, limite_horas, limite_dias, horas_instalacao, horas_instalacao_motor, horas_instalacao_helice, data_instalacao, ultima_revisao_horas, ultima_revisao_data, nome_anexo, dados_anexo, anexos, marca, condicao, oficina_executante, sistema)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, horasInstalacaoMotor || 0, horasInstalacaoHelice || 0, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData, primaryNome, primaryDados, anexosJson, marca || null, condicao || null, oficinaExecutante || null, sistema || 'celula']
    );
    return {
      ...comp,
      anexos: anexosList,
      nomeAnexo: primaryNome || undefined,
      dadosAnexo: primaryDados || undefined
    };
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar componente: ' + err.message);
    throw err;
  }
}

export async function updateComponente(comp: ComponenteControlado): Promise<ComponenteControlado> {
  try {
    const p = checkPool();
    const { id, aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, horasInstalacaoMotor, horasInstalacaoHelice, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData, nomeAnexo, dadosAnexo, anexos, marca, condicao, oficinaExecutante, sistema } = comp;
    const anexosList = Array.isArray(anexos)
      ? anexos.filter(a => a && a.nome && a.dados)
      : (nomeAnexo && dadosAnexo ? [{ nome: nomeAnexo, dados: dadosAnexo }] : []);
    const primaryNome = anexosList[0]?.nome || null;
    const primaryDados = anexosList[0]?.dados || null;
    const anexosJson = anexosList.length > 0 ? JSON.stringify(anexosList) : null;

    await p.query(
      `UPDATE componentes SET aeronave_id = $1, nome = $2, part_number = $3, serial_number = $4, limite_horas = $5, limite_dias = $6, horas_instalacao = $7, horas_instalacao_motor = $8, horas_instalacao_helice = $9, data_instalacao = $10, ultima_revisao_horas = $11, ultima_revisao_data = $12, nome_anexo = $13, dados_anexo = $14, anexos = $15, marca = $16, condicao = $17, oficina_executante = $18, sistema = $19 WHERE id = $20`,
      [aeronaveId, nome, partNumber, serialNumber, limiteHoras, limiteDias, horasInstalacao, horasInstalacaoMotor || 0, horasInstalacaoHelice || 0, dataInstalacao, ultimaRevisaoHoras, ultimaRevisaoData, primaryNome, primaryDados, anexosJson, marca || null, condicao || null, oficinaExecutante || null, sistema || 'celula', id]
    );
    return {
      ...comp,
      anexos: anexosList,
      nomeAnexo: primaryNome || undefined,
      dadosAnexo: primaryDados || undefined
    };
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
        `UPDATE componentes SET horas_instalacao = $1, ultima_revisao_horas = 0, ultima_revisao_data = $2 WHERE id = $3`,
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

// GERENCIAMENTO DE USUÁRIOS DE OFICINA (ACESSO À DOCUMENTAÇÃO)
export async function getUsuariosOficina(clienteId: string): Promise<UsuarioOficina[]> {
  try {
    const p = checkPool();
    const res = await p.query('SELECT * FROM usuarios_oficina WHERE cliente_id = $1 ORDER BY nome ASC', [clienteId]);
    return res.rows.map(row => ({
      id: row.id,
      clienteId: row.cliente_id,
      nome: row.nome,
      email: row.email,
      senha: row.senha,
      tipoPrazo: row.tipo_prazo as 'indeterminado' | 'determinado',
      prazoAcesso: row.prazo_acesso || undefined,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro ao consultar usuários de oficina: ' + err.message);
    throw err;
  }
}

export async function getUsuarioOficinaByEmail(email: string): Promise<UsuarioOficina | null> {
  try {
    const p = checkPool();
    const res = await p.query('SELECT * FROM usuarios_oficina WHERE LOWER(email) = $1', [email.toLowerCase().trim()]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      clienteId: row.cliente_id,
      nome: row.nome,
      email: row.email,
      senha: row.senha,
      tipoPrazo: row.tipo_prazo as 'indeterminado' | 'determinado',
      prazoAcesso: row.prazo_acesso || undefined,
      created_at: row.created_at
    };
  } catch (err: any) {
    setDbConnectionError('Erro ao buscar usuário de oficina por e-mail: ' + err.message);
    throw err;
  }
}

export async function addUsuarioOficina(usuario: UsuarioOficina): Promise<UsuarioOficina> {
  try {
    const p = checkPool();
    const { id, clienteId, nome, email, senha, tipoPrazo, prazoAcesso } = usuario;
    await p.query(
      'INSERT INTO usuarios_oficina (id, cliente_id, nome, email, senha, tipo_prazo, prazo_acesso) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, clienteId, nome, email.toLowerCase().trim(), senha, tipoPrazo, prazoAcesso || null]
    );
    return usuario;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar usuário de oficina: ' + err.message);
    throw err;
  }
}

export async function updateUsuarioOficina(usuario: UsuarioOficina): Promise<UsuarioOficina> {
  try {
    const p = checkPool();
    const { id, nome, email, senha, tipoPrazo, prazoAcesso } = usuario;
    await p.query(
      'UPDATE usuarios_oficina SET nome = $1, email = $2, senha = $3, tipo_prazo = $4, prazo_acesso = $5 WHERE id = $6',
      [nome, email.toLowerCase().trim(), senha, tipoPrazo, prazoAcesso || null, id]
    );
    return usuario;
  } catch (err: any) {
    setDbConnectionError('Erro ao atualizar usuário de oficina: ' + err.message);
    throw err;
  }
}

export async function deleteUsuarioOficina(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM usuarios_oficina WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar usuário de oficina: ' + err.message);
    throw err;
  }
}

// GERENCIAMENTO DE PILOTOS (ACESSO EXCLUSIVO AO DIÁRIO DE BORDO)
export async function getUsuariosPilotos(clienteId: string): Promise<UsuarioPiloto[]> {
  try {
    const p = checkPool();
    const res = await p.query('SELECT * FROM usuarios_pilotos WHERE cliente_id = $1 ORDER BY nome ASC', [clienteId]);
    return res.rows.map(row => ({
      id: row.id,
      clienteId: row.cliente_id,
      nome: row.nome,
      email: row.email || undefined,
      senha: row.senha,
      canac: row.canac || '',
      tipoPrazo: row.tipo_prazo as 'indeterminado' | 'determinado',
      prazoAcesso: row.prazo_acesso || undefined,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro ao consultar pilotos: ' + err.message);
    throw err;
  }
}

export async function getUsuarioPilotoByEmail(email: string): Promise<UsuarioPiloto | null> {
  try {
    const clean = email.toLowerCase().trim();
    if (!clean) return null;
    const p = checkPool();
    const res = await p.query('SELECT * FROM usuarios_pilotos WHERE LOWER(email) = $1', [clean]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      clienteId: row.cliente_id,
      nome: row.nome,
      email: row.email || undefined,
      senha: row.senha,
      canac: row.canac || '',
      tipoPrazo: row.tipo_prazo as 'indeterminado' | 'determinado',
      prazoAcesso: row.prazo_acesso || undefined,
      created_at: row.created_at
    };
  } catch (err: any) {
    setDbConnectionError('Erro ao buscar piloto por e-mail: ' + err.message);
    throw err;
  }
}

export async function getUsuarioPilotoByCanac(canac: string): Promise<UsuarioPiloto | null> {
  try {
    const clean = String(canac || '').replace(/\D/g, '').slice(0, 6);
    if (!clean) return null;
    const p = checkPool();
    const res = await p.query('SELECT * FROM usuarios_pilotos WHERE canac = $1', [clean]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      clienteId: row.cliente_id,
      nome: row.nome,
      email: row.email || undefined,
      senha: row.senha,
      canac: row.canac || '',
      tipoPrazo: row.tipo_prazo as 'indeterminado' | 'determinado',
      prazoAcesso: row.prazo_acesso || undefined,
      created_at: row.created_at
    };
  } catch (err: any) {
    setDbConnectionError('Erro ao buscar piloto por código ANAC: ' + err.message);
    throw err;
  }
}

export async function addUsuarioPiloto(usuario: UsuarioPiloto): Promise<UsuarioPiloto> {
  try {
    const p = checkPool();
    const { id, clienteId, nome, email, senha, canac, tipoPrazo, prazoAcesso } = usuario;
    const normalizedEmail = email && email.trim() ? email.toLowerCase().trim() : null;
    const normalizedCanac = String(canac || '').replace(/\D/g, '').slice(0, 6);
    await p.query(
      'INSERT INTO usuarios_pilotos (id, cliente_id, nome, email, senha, canac, tipo_prazo, prazo_acesso) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, clienteId, nome, normalizedEmail, senha, normalizedCanac || null, tipoPrazo, prazoAcesso || null]
    );
    return { ...usuario, email: normalizedEmail || undefined, canac: normalizedCanac };
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar piloto: ' + err.message);
    throw err;
  }
}

export async function updateUsuarioPiloto(usuario: UsuarioPiloto): Promise<UsuarioPiloto> {
  try {
    const p = checkPool();
    const { id, nome, email, senha, canac, tipoPrazo, prazoAcesso } = usuario;
    const normalizedEmail = email && email.trim() ? email.toLowerCase().trim() : null;
    const normalizedCanac = String(canac || '').replace(/\D/g, '').slice(0, 6);
    await p.query(
      'UPDATE usuarios_pilotos SET nome = $1, email = $2, senha = $3, canac = $4, tipo_prazo = $5, prazo_acesso = $6 WHERE id = $7',
      [nome, normalizedEmail, senha, normalizedCanac || null, tipoPrazo, prazoAcesso || null, id]
    );
    return { ...usuario, email: normalizedEmail || undefined, canac: normalizedCanac };
  } catch (err: any) {
    setDbConnectionError('Erro ao atualizar piloto: ' + err.message);
    throw err;
  }
}

export async function deleteUsuarioPiloto(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM usuarios_pilotos WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar piloto: ' + err.message);
    throw err;
  }
}

// INSPEÇÕES PERIÓDICAS
export async function getInspecoesPeriodicas(aeronaveId?: string): Promise<InspecaoPeriodica[]> {
  try {
    const p = checkPool();
    let query = 'SELECT * FROM inspecoes_periodicas';
    const params: any[] = [];
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
      sistema: (row.sistema as 'celula' | 'motor') || 'celula',
      conteudo: row.conteudo || '',
      observacao: row.observacao || undefined,
      limiteHoras: Number(row.limite_horas || 0),
      limiteDias: Number(row.limite_dias || 0),
      dataRealizacao: row.data_realizacao || '',
      horasCelulaNaInspecao: Number(row.horas_celula_na_inspecao || 0),
      horasMotorNaInspecao: row.horas_motor_na_inspecao !== null && row.horas_motor_na_inspecao !== undefined ? Number(row.horas_motor_na_inspecao) : 0,
      oficinaExecutante: row.oficina_executante || undefined,
      created_at: row.created_at
    }));
  } catch (err: any) {
    setDbConnectionError('Erro na consulta de inspeções periódicas: ' + err.message);
    throw err;
  }
}

export async function addInspecaoPeriodica(insp: InspecaoPeriodica): Promise<InspecaoPeriodica> {
  try {
    const p = checkPool();
    const {
      id,
      aeronaveId,
      nome,
      sistema,
      conteudo,
      observacao,
      limiteHoras,
      limiteDias,
      dataRealizacao,
      horasCelulaNaInspecao,
      horasMotorNaInspecao,
      oficinaExecutante
    } = insp;

    await p.query(
      `INSERT INTO inspecoes_periodicas (id, aeronave_id, nome, sistema, conteudo, observacao, limite_horas, limite_dias, data_realizacao, horas_celula_na_inspecao, horas_motor_na_inspecao, oficina_executante)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        aeronaveId,
        nome,
        sistema || 'celula',
        conteudo || '',
        observacao || null,
        limiteHoras || 0,
        limiteDias || 0,
        dataRealizacao || '',
        horasCelulaNaInspecao || 0,
        sistema === 'motor' ? (horasMotorNaInspecao || 0) : 0,
        oficinaExecutante || null
      ]
    );
    return insp;
  } catch (err: any) {
    setDbConnectionError('Erro ao adicionar inspeção periódica: ' + err.message);
    throw err;
  }
}

export async function updateInspecaoPeriodica(insp: InspecaoPeriodica): Promise<InspecaoPeriodica> {
  try {
    const p = checkPool();
    const {
      id,
      aeronaveId,
      nome,
      sistema,
      conteudo,
      observacao,
      limiteHoras,
      limiteDias,
      dataRealizacao,
      horasCelulaNaInspecao,
      horasMotorNaInspecao,
      oficinaExecutante
    } = insp;

    await p.query(
      `UPDATE inspecoes_periodicas SET aeronave_id = $1, nome = $2, sistema = $3, conteudo = $4, observacao = $5, limite_horas = $6, limite_dias = $7, data_realizacao = $8, horas_celula_na_inspecao = $9, horas_motor_na_inspecao = $10, oficina_executante = $11 WHERE id = $12`,
      [
        aeronaveId,
        nome,
        sistema || 'celula',
        conteudo || '',
        observacao || null,
        limiteHoras || 0,
        limiteDias || 0,
        dataRealizacao || '',
        horasCelulaNaInspecao || 0,
        sistema === 'motor' ? (horasMotorNaInspecao || 0) : 0,
        oficinaExecutante || null,
        id
      ]
    );
    return insp;
  } catch (err: any) {
    setDbConnectionError('Erro ao atualizar inspeção periódica: ' + err.message);
    throw err;
  }
}

export async function deleteInspecaoPeriodica(id: string): Promise<void> {
  try {
    const p = checkPool();
    await p.query('DELETE FROM inspecoes_periodicas WHERE id = $1', [id]);
  } catch (err: any) {
    setDbConnectionError('Erro ao deletar inspeção periódica: ' + err.message);
    throw err;
  }
}


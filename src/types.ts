/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  documento: string; // CPF / CNPJ
  endereco?: string;
  whatsapp?: string;
  tipoPessoa?: 'PF' | 'PJ';
  senha?: string;
  created_at?: string;
}

export interface UsuarioOficina {
  id: string;
  clienteId: string;
  nome: string;
  email: string;
  senha: string;
  tipoPrazo: 'indeterminado' | 'determinado';
  prazoAcesso?: string; // YYYY-MM-DD
  created_at?: string;
}

export interface UsuarioPiloto {
  id: string;
  clienteId: string;
  nome: string;
  canac: string; // 6 dígitos numéricos (usado como login)
  email?: string; // Opcional
  senha: string;
  tipoPrazo: 'indeterminado' | 'determinado';
  prazoAcesso?: string; // YYYY-MM-DD
  created_at?: string;
}

export interface Aeronave {
  id: string;
  matricula: string; // Prefixo, ex: PT-XYZ
  modelo: string;
  fabricante: string;
  ano: number;
  horasTotais: number; // Horas atuais acumuladas de voo (Célula)
  horasMotor: number; // Horas acumuladas do motor
  horasHelice: number; // Horas acumuladas da hélice
  clienteId: string;
  created_at?: string;
}

export interface HistoricoVoo {
  id: string;
  aeronaveId: string;
  data: string; // YYYY-MM-DD
  de?: string; // 4 caracteres (ex: SBSP)
  para?: string; // 4 caracteres (ex: SBGL)
  partida?: string; // HH:MM
  decolagem?: string; // HH:MM
  pouso?: string; // HH:MM
  corte?: string; // HH:MM
  pax?: number; // Quantidade de passageiros (número)
  pc?: number; // P/C (número)
  canac?: string; // 6 dígitos numéricos
  horasVoo: number; // Quantas horas durou o voo em decimal, calculado por Partida -> Corte
  piloto: string;
  descricao: string; // Ocorrências
  created_at?: string;
  pendingSync?: boolean;
  queuedAt?: string;
  syncError?: string;
}

export interface AnexoComponente {
  nome: string;
  dados: string;
}

export interface ComponenteControlado {
  id: string;
  aeronaveId: string;
  nome: string; // Ex: Magneto, Turbina, Hélice, Óleo do Motor
  partNumber: string;
  serialNumber: string;
  
  // Limites de controle (por horas de voo e por data)
  limiteHoras: number; // Limite de horas de voo entre revisões, ex: 500 (colocar 0 se não controlado por horas)
  limiteDias: number;  // Limite de dias entre revisões, ex: 365 (colocar 0 se não controlado por dias)
  
  // Datas e horas de referência
  horasInstalacao: number; // Horas de voo da aeronave quando instalado (Célula)
  horasInstalacaoMotor?: number; // Horas do motor quando instalado
  horasInstalacaoHelice?: number; // Horas da hélice quando instalado
  dataInstalacao: string; // Data de instalação: YYYY-MM-DD
  
  // Dados da última revisão
  ultimaRevisaoHoras: number; // Horas de voo da aeronave na última revisão
  ultimaRevisaoData: string;  // Data da última revisão: YYYY-MM-DD
  
  nomeAnexo?: string; // Nome do documento/imagem anexo (legado / principal)
  dadosAnexo?: string; // Conteúdo base64 do documento/imagem anexo (legado / principal)
  anexos?: AnexoComponente[]; // Lista de múltiplos documentos/imagens anexos

  marca?: string; // Marca / Fabricante do componente
  condicao?: 'novo' | 'overhaul'; // Condição do componente: novo ou overhaul
  oficinaExecutante?: string; // Oficina executante do componente
  sistema?: 'celula' | 'motor' | 'helice'; // Associação com Célula, Motor ou Hélice

  created_at?: string;
}

export interface RevisaoLaudo {
  id: string;
  aeronaveId: string;
  componenteId?: string; // Opcional, se for manutenção geral da aeronave
  data: string; // YYYY-MM-DD
  horasNaRevisao: number; // Horas acumuladas da aeronave na revisão
  descricao: string;
  tipo: 'preventiva' | 'corretiva' | 'periodica';
  nomeAnexo?: string; // Nome do arquivo anexo (PDF, Imagem, etc.)
  dadosAnexo?: string; // Conteúdo do arquivo em formato Base64 para visualização ou download
  created_at?: string;
}

export interface InspecaoPeriodica {
  id: string;
  aeronaveId: string;
  nome: string;
  sistema: 'celula' | 'motor';
  conteudo: string;
  observacao?: string;
  limiteHoras: number;
  limiteDias: number;
  dataRealizacao: string; // YYYY-MM-DD
  horasCelulaNaInspecao: number;
  horasMotorNaInspecao?: number;
  oficinaExecutante?: string;
  created_at?: string;
}

// Interface para Alertas Calculados
export interface AlertaManutencao {
  idComponente: string;
  nomeComponente: string;
  tipoItem?: 'componente' | 'inspecao';
  sistema?: 'celula' | 'motor' | 'helice';
  metric: 'horas' | 'dias' | 'ambas';
  
  // Horas
  horasRestantes: number;
  horasLimite: number;
  horasUltima: number;
  
  // Dias
  diasRestantes: number;
  diasLimite: number;
  dataUltima: string;
  dataVencimento: string;
  
  status: 'regular' | 'atencao' | 'critico'; // critico = venceu ou < 10% restante, atencao = < 25% restante
  
  // Campos para múltiplos sistemas (Célula e Motor/Hélice)
  horasLimiteCelula?: number;
  horasLimiteMotor?: number;
  horasLimiteHelice?: number;
  horasRestantesCelula?: number;
  horasRestantesMotor?: number;
  horasRestantesHelice?: number;
}

export interface DashboardStats {
  totalClientes: number;
  totalAeronaves: number;
  totalHorasVoadas: number;
  alertasCriticos: number;
  alertasAtencao: number;
}

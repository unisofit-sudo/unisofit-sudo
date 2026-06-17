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
  created_at?: string;
}

export interface Aeronave {
  id: string;
  matricula: string; // Prefixo, ex: PT-XYZ
  modelo: string;
  fabricante: string;
  ano: number;
  horasTotais: number; // Horas atuais acumuladas de voo
  clienteId: string;
  created_at?: string;
}

export interface HistoricoVoo {
  id: string;
  aeronaveId: string;
  data: string; // YYYY-MM-DD
  horasVoo: number; // Quantas horas durou o voo, ex: 1.5, 2.0
  piloto: string;
  descricao: string; // Origem, destino ou observações
  created_at?: string;
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
  horasInstalacao: number; // Horas de voo da aeronave quando instalado
  dataInstalacao: string; // Data de instalação: YYYY-MM-DD
  
  // Dados da última revisão
  ultimaRevisaoHoras: number; // Horas de voo da aeronave na última revisão
  ultimaRevisaoData: string;  // Data da última revisão: YYYY-MM-DD
  
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

// Interface para Alertas Calculados
export interface AlertaManutencao {
  idComponente: string;
  nomeComponente: string;
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
}

export interface DashboardStats {
  totalClientes: number;
  totalAeronaves: number;
  totalHorasVoadas: number;
  alertasCriticos: number;
  alertasAtencao: number;
}

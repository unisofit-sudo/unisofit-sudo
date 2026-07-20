/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ComponenteControlado, Aeronave, AlertaManutencao } from './types';

// Formata data formato brasileiro DD/MM/AAAA
export function formatDataBR(dataISO: string | undefined): string {
  if (!dataISO) return '-';
  const parts = dataISO.split('-');
  if (parts.length !== 3) return dataISO;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Calcula data de vencimento adicionando dias
export function adicionarDias(dataISO: string, dias: number): string {
  if (!dataISO) return '';
  const date = new Date(dataISO + 'T12:00:00'); // Evita timezone shifts
  date.setDate(date.getDate() + dias);
  return date.toISOString().split('T')[0];
}

// Calcula diferença em dias entre duas datas
export function diferencaDias(dataFimISO: string, dataInicioISO: string): number {
  const f = new Date(dataFimISO + 'T12:00:00');
  const i = new Date(dataInicioISO + 'T12:00:00');
  const diffTime = f.getTime() - i.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Retorna a data de hoje no formato YYYY-MM-DD considerando o fuso horário local
export function obterDataHojeISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Computa a data atual padrão
const DATA_ATUAL_PADRAO = obterDataHojeISO();

// Calcula alertas detalhados para um determinado componente
export function calcularAlerta(
  comp: ComponenteControlado,
  aero: Aeronave,
  dataAtualISO: string = DATA_ATUAL_PADRAO
): AlertaManutencao {
  const { limiteHoras, limiteDias, ultimaRevisaoHoras, ultimaRevisaoData, horasInstalacao, sistema, dataInstalacao, condicao } = comp;
  
  // Determina as horas voadas do sistema específico da aeronave desde a instalação do componente
  let horasVoadasDesdeInstalacao = 0;
  if (sistema === 'motor') {
    const instMotor = comp.horasInstalacaoMotor || 0;
    const currentMotor = aero.horasMotor || 0;
    horasVoadasDesdeInstalacao = Math.max(0, currentMotor - instMotor);
  } else if (sistema === 'helice') {
    const instHelice = comp.horasInstalacaoHelice || 0;
    const currentHelice = aero.horasHelice || 0;
    horasVoadasDesdeInstalacao = Math.max(0, currentHelice - instHelice);
  } else {
    const instCelula = comp.horasInstalacao || 0;
    const currentCelula = aero.horasTotais || 0;
    horasVoadasDesdeInstalacao = Math.max(0, currentCelula - instCelula);
  }

  let horasLimite = 0;
  let horasRestantes = 999999;

  let horasLimiteCelula: number | undefined;
  let horasLimiteMotor: number | undefined;
  let horasLimiteHelice: number | undefined;
  let horasRestantesCelula: number | undefined;
  let horasRestantesMotor: number | undefined;
  let horasRestantesHelice: number | undefined;

  if (limiteHoras > 0) {
    // Os limites nos respectivos horímetros da aeronave onde ocorrerá o vencimento
    horasLimiteCelula = (comp.horasInstalacao || 0) + limiteHoras;
    horasLimiteMotor = (comp.horasInstalacaoMotor || 0) + limiteHoras;
    horasLimiteHelice = (comp.horasInstalacaoHelice || 0) + limiteHoras;

    // Horas restantes em cada sistema
    horasRestantesCelula = horasLimiteCelula - (aero.horasTotais || 0);
    horasRestantesMotor = horasLimiteMotor - (aero.horasMotor || 0);
    horasRestantesHelice = horasLimiteHelice - (aero.horasHelice || 0);

    // O limite geral e horas restantes a serem considerados para o cálculo principal e barra de progresso
    if (sistema === 'motor') {
      horasLimite = horasLimiteMotor;
      horasRestantes = horasRestantesMotor;
    } else if (sistema === 'helice') {
      horasLimite = horasLimiteHelice;
      horasRestantes = horasRestantesHelice;
    } else {
      horasLimite = horasLimiteCelula;
      horasRestantes = horasRestantesCelula;
    }
  }
  
  // Cálculo de dias
  let diasRestantes = 999999;
  let dataVencimento = '';
  
  // Se for overhauled, considera a data da última revisão como data de referência. Caso contrário, a de instalação.
  const dataRef = (condicao === 'overhaul' && ultimaRevisaoData) ? ultimaRevisaoData : dataInstalacao;
  
  if (limiteDias > 0 && dataRef) {
    dataVencimento = adicionarDias(dataRef, limiteDias);
    diasRestantes = diferencaDias(dataVencimento, dataAtualISO);
  }
  
  // Determinar métrica controlada
  let metric: 'horas' | 'dias' | 'ambas' = 'ambas';
  if (limiteHoras > 0 && limiteDias === 0) metric = 'horas';
  if (limiteHoras === 0 && limiteDias > 0) metric = 'dias';
  
  // Avaliar status do alerta
  let statusHoras: 'regular' | 'atencao' | 'critico' = 'regular';
  if (limiteHoras > 0) {
    if (horasRestantes <= 0 || horasRestantes <= (limiteHoras * 0.1)) {
      statusHoras = 'critico';
    } else if (horasRestantes <= (limiteHoras * 0.25)) {
      statusHoras = 'atencao';
    }
  }
  
  let statusDias: 'regular' | 'atencao' | 'critico' = 'regular';
  if (limiteDias > 0) {
    if (diasRestantes <= 0 || diasRestantes <= 15) {
      statusDias = 'critico';
    } else if (diasRestantes <= 45) {
      statusDias = 'atencao';
    }
  }
  
  // O status final é o mais grave dos dois
  let status: 'regular' | 'atencao' | 'critico' = 'regular';
  if (statusHoras === 'critico' || statusDias === 'critico') {
    status = 'critico';
  } else if (statusHoras === 'atencao' || statusDias === 'atencao') {
    status = 'atencao';
  }
  
  return {
    idComponente: comp.id,
    nomeComponente: comp.nome,
    metric,
    horasRestantes: limiteHoras > 0 ? horasRestantes : 0,
    horasLimite,
    horasUltima: ultimaRevisaoHoras,
    diasRestantes: limiteDias > 0 ? diasRestantes : 0,
    diasLimite: limiteDias,
    dataUltima: dataRef || '',
    dataVencimento,
    status,
    horasLimiteCelula,
    horasLimiteMotor,
    horasLimiteHelice,
    horasRestantesCelula,
    horasRestantesMotor,
    horasRestantesHelice
  };
}

// Retorna resumo de alertas de uma lista de componentes de uma aeronave
export function calcularTodosAlertas(
  componentes: ComponenteControlado[],
  aero: Aeronave,
  dataAtualISO: string = DATA_ATUAL_PADRAO
): AlertaManutencao[] {
  return componentes.map(c => calcularAlerta(c, aero, dataAtualISO));
}

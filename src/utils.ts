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

// Calcula alertas detalhados para um determinado componente
export function calcularAlerta(
  comp: ComponenteControlado,
  aero: Aeronave,
  dataAtualISO: string = '2026-06-16'
): AlertaManutencao {
  const { limiteHoras, limiteDias, ultimaRevisaoHoras, ultimaRevisaoData } = comp;
  const horasAtuais = aero.horasTotais;
  
  // Cálculo de horas
  let horasRestantes = 999999;
  let horasLimite = 0;
  if (limiteHoras > 0) {
    horasLimite = ultimaRevisaoHoras + limiteHoras;
    horasRestantes = horasLimite - horasAtuais;
  }
  
  // Cálculo de dias
  let diasRestantes = 999999;
  let dataVencimento = '';
  if (limiteDias > 0 && ultimaRevisaoData) {
    dataVencimento = adicionarDias(ultimaRevisaoData, limiteDias);
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
    dataUltima: ultimaRevisaoData,
    dataVencimento,
    status
  };
}

// Retorna resumo de alertas de uma lista de componentes de uma aeronave
export function calcularTodosAlertas(
  componentes: ComponenteControlado[],
  aero: Aeronave,
  dataAtualISO: string = '2026-06-16'
): AlertaManutencao[] {
  return componentes.map(c => calcularAlerta(c, aero, dataAtualISO));
}

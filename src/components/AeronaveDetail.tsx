/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Aeronave, Cliente, HistoricoVoo, ComponenteControlado, RevisaoLaudo, AlertaManutencao } from '../types';
import { calcularAlerta, calcularTodosAlertas, formatDataBR } from '../utils';
import {
  Wrench,
  Gauge,
  Calendar,
  History,
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle,
  Plus,
  Trash2,
  Download,
  Printer,
  ChevronRight,
  Clock,
  User,
  ShieldAlert,
  Paperclip,
  Activity,
  FileSpreadsheet
} from 'lucide-react';

interface AeronaveDetailProps {
  aeronave: Aeronave;
  cliente: Cliente;
  onRefreshAeronave: () => void;
}

export default function AeronaveDetail({
  aeronave,
  cliente,
  onRefreshAeronave
}: AeronaveDetailProps) {
  const [activeTab, setActiveTab] = useState<'mapa' | 'componentes' | 'voos' | 'laudos'>('mapa');
  
  // Dados dinâmicos buscados do servidor
  const [componentes, setComponentes] = useState<ComponenteControlado[]>([]);
  const [voos, setVoos] = useState<HistoricoVoo[]>([]);
  const [revisoes, setRevisoes] = useState<RevisaoLaudo[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertFilter, setAlertFilter] = useState<'todos' | 'critico' | 'atencao'>('todos');

  // Formulário: Diário de Bordo (Voo)
  const [isVooFormOpen, setIsVooFormOpen] = useState(false);
  const [vooData, setVooData] = useState(new Date().toISOString().split('T')[0]);
  const [vooHoras, setVooHoras] = useState(1.5);
  const [vooPiloto, setVooPiloto] = useState('');
  const [vooDescricao, setVooDescricao] = useState('');

  // Formulário: Cadastrar Componente
  const [isCompFormOpen, setIsCompFormOpen] = useState(false);
  const [compEditing, setCompEditing] = useState<ComponenteControlado | null>(null);
  const [compNome, setCompNome] = useState('');
  const [compPartNumber, setCompPartNumber] = useState('');
  const [compSerialNumber, setCompSerialNumber] = useState('');
  const [compLimiteHoras, setCompLimiteHoras] = useState(500);
  const [compLimiteDias, setCompLimiteDias] = useState(365);
  const [compHorasInstalacao, setCompHorasInstalacao] = useState(aeronave.horasTotais);
  const [compDataInstalacao, setCompDataInstalacao] = useState(new Date().toISOString().split('T')[0]);
  const [compUltimaRevisaoHoras, setCompUltimaRevisaoHoras] = useState(aeronave.horasTotais);
  const [compUltimaRevisaoData, setCompUltimaRevisaoData] = useState(new Date().toISOString().split('T')[0]);

  // Formulário: Nova Revisão / Carga de Laudo
  const [isRevFormOpen, setIsRevFormOpen] = useState(false);
  const [revData, setRevData] = useState(new Date().toISOString().split('T')[0]);
  const [revHoras, setRevHoras] = useState(aeronave.horasTotais);
  const [revTipo, setRevTipo] = useState<'preventiva' | 'corretiva' | 'periodica'>('periodica');
  const [revDescricao, setRevDescricao] = useState('');
  const [revComponenteId, setRevComponenteId] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentData, setAttachmentData] = useState('');

  // --- CARGA DE DADOS ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const [compRes, voosRes, revRes] = await Promise.all([
        fetch(`/api/componentes?aeronaveId=${aeronave.id}`),
        fetch(`/api/historico?aeronaveId=${aeronave.id}`),
        fetch(`/api/revisoes?aeronaveId=${aeronave.id}`)
      ]);
      
      if (compRes.ok) setComponentes(await compRes.json());
      if (voosRes.ok) setVoos(await voosRes.json());
      if (revRes.ok) setRevisoes(await revRes.json());
    } catch (error) {
      console.error('Erro ao buscar dados na detalhadora:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [aeronave.id]);

  // Calcula os alertas com base nas horas atuais da aeronave
  const alertas = calcularTodosAlertas(componentes, aeronave);
  const alertasFiltrados = alertas.filter(a => {
    if (alertFilter === 'critico') return a.status === 'critico';
    if (alertFilter === 'atencao') return a.status === 'atencao';
    return true;
  });

  const countCriticos = alertas.filter(a => a.status === 'critico').length;
  const countAtencao = alertas.filter(a => a.status === 'atencao').length;

  // --- SUBMISSÃO DIÁRIO DE VOO ---
  const handleAddVoo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vooHoras <= 0) return;
    try {
      const response = await fetch('/api/historico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aeronaveId: aeronave.id,
          data: vooData,
          horasVoo: Number(vooHoras),
          piloto: vooPiloto.trim(),
          descricao: vooDescricao.trim()
        })
      });
      if (response.ok) {
        setIsVooFormOpen(false);
        setVooPiloto('');
        setVooDescricao('');
        onRefreshAeronave(); // Recarrega horas calculadas gerais na aeronave pai
        fetchData(); // Recarrega tabelas locais
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteVoo = async (id: string) => {
    if (confirm('Tem certeza de que deseja remover este registro de voo? As horas acumuladas da aeronave serão ajustadas automaticamente.')) {
      try {
        const res = await fetch(`/api/historico/${id}`, { method: 'DELETE' });
        if (res.ok) {
          onRefreshAeronave();
          fetchData();
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // --- SUBMISSÃO COMPONENTE ---
  const handleSaveComponente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compNome.trim()) return;

    const compPayload = {
      id: compEditing?.id,
      aeronaveId: aeronave.id,
      nome: compNome.trim(),
      partNumber: compPartNumber.trim(),
      serialNumber: compSerialNumber.trim(),
      limiteHoras: Number(compLimiteHoras || 0),
      limiteDias: Number(compLimiteDias || 0),
      horasInstalacao: Number(compHorasInstalacao || 0),
      dataInstalacao: compDataInstalacao,
      ultimaRevisaoHoras: Number(compUltimaRevisaoHoras || 0),
      ultimaRevisaoData: compUltimaRevisaoData
    };

    try {
      const url = '/api/componentes';
      const method = compEditing ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compPayload)
      });
      if (response.ok) {
        setIsCompFormOpen(false);
        setCompEditing(null);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditComponente = (c: ComponenteControlado) => {
    setCompEditing(c);
    setCompNome(c.nome);
    setCompPartNumber(c.partNumber);
    setCompSerialNumber(c.serialNumber);
    setCompLimiteHoras(c.limiteHoras);
    setCompLimiteDias(c.limiteDias);
    setCompHorasInstalacao(c.horasInstalacao);
    setCompDataInstalacao(c.dataInstalacao);
    setCompUltimaRevisaoHoras(c.ultimaRevisaoHoras);
    setCompUltimaRevisaoData(c.ultimaRevisaoData);
    setIsCompFormOpen(true);
  };

  const handleDeleteComponente = async (id: string) => {
    if (confirm('Deseja realmente remover este componente controlado? Os logs históricos relacionados deixarão de referenciá-lo.')) {
      try {
        const res = await fetch(`/api/componentes/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // --- PROCESSAR ANEXO (CONVERSÃO BASE64) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('O arquivo selecionado excede o limite recomendado de 15MB para transferência.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // --- SUBMISSÃO REVISÃO / LAUDO ---
  const handleAddRevisao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revDescricao.trim()) return;

    const payload = {
      aeronaveId: aeronave.id,
      componenteId: revComponenteId || undefined,
      data: revData,
      horasNaRevisao: Number(revHoras),
      tipo: revTipo,
      descricao: revDescricao.trim(),
      nomeAnexo: attachmentName || undefined,
      dadosAnexo: attachmentData || undefined
    };

    try {
      const response = await fetch('/api/revisoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setIsRevFormOpen(false);
        setRevDescricao('');
        setRevComponenteId('');
        setAttachmentName('');
        setAttachmentData('');
        fetchData(); // Recarrega dados locais das revisões e as horas recalculadas dos componentes!
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRevisao = async (id: string) => {
    if (confirm('Tem certeza de que deseja excluir este laudo de revisão?')) {
      try {
        const res = await fetch(`/api/revisoes/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Prepara formulário de laudo direcionado para um componente
  const openRevisaoForComponente = (c: ComponenteControlado) => {
    setRevComponenteId(c.id);
    setRevHoras(aeronave.horasTotais);
    setRevDescricao(`Inspeção periódica realizada no componente ${c.nome}. PN: ${c.partNumber}, SN: ${c.serialNumber}.`);
    setIsRevFormOpen(true);
    setActiveTab('laudos');
  };

  return (
    <div className="space-y-6" id={`aeronave-workspace-${aeronave.matricula}`}>
      {/* Visual principal da aeronave */}
      <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50 shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-405 border border-emerald-500/20 px-2.5 py-0.5 rounded-full inline-block">
              AERONAVE ATIVA
            </span>
            <span className="text-[11px] text-slate-400">Proprietário: <strong className="text-slate-200">{cliente.nome}</strong></span>
          </div>
          <h1 className="text-3xl font-display font-extrabold text-white tracking-tight flex items-center gap-2">
            {aeronave.matricula}
            <span className="text-xs font-semibold text-slate-300 px-3 py-1 bg-slate-700/50 rounded-full border border-slate-600/30">
              {aeronave.fabricante} {aeronave.modelo}
            </span>
          </h1>
          <p className="text-xs text-slate-400 flex items-center gap-3 font-mono">
            <span>Fabricação: <strong className="text-slate-300">{aeronave.ano}</strong></span>
            <span className="text-slate-600">•</span>
            <span>ID Interno: <strong className="text-slate-300">{aeronave.id}</strong></span>
          </p>
        </div>
        
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-705/30 w-full md:w-auto flex items-center md:items-start gap-4">
          <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
            <Gauge className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Horas Totais de Voo</p>
            <p className="text-2xl font-black text-sky-450">{aeronave.horasTotais.toFixed(1)} <span className="text-xs font-normal text-slate-400">hs</span></p>
            <span className="text-[9px] text-slate-500 block">Tempo em Serviço (T.S.N.)</span>
          </div>
        </div>

        {/* Contador de Alertas Rápidos */}
        <div className="w-full md:absolute md:bottom-3 md:right-3 flex flex-wrap gap-4 text-[10px] uppercase font-bold tracking-wider mt-2 md:mt-0">
          <div className="flex items-center gap-2 bg-slate-900/30 px-3 py-1.5 rounded-xl border border-slate-700/30 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>Componentes Monitorados: <strong>{componentes.length}</strong></span>
          </div>

          <div
            onClick={() => { setActiveTab('mapa'); setAlertFilter('critico'); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              countCriticos > 0 
                ? 'bg-red-500/15 border-red-500/30 text-red-300 animate-pulse' 
                : 'bg-slate-900/30 border-slate-700/30 text-slate-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${countCriticos > 0 ? 'bg-red-500' : 'bg-slate-600'}`}></span>
            <span>Vencidos / Críticos: <strong>{countCriticos}</strong></span>
          </div>

          <div
            onClick={() => { setActiveTab('mapa'); setAlertFilter('atencao'); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              countAtencao > 0 
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' 
                : 'bg-slate-900/30 border-slate-700/30 text-slate-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${countAtencao > 0 ? 'bg-amber-400' : 'bg-slate-600'}`}></span>
            <span>Alerta de Atenção: <strong>{countAtencao}</strong></span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-700/40 gap-1 bg-slate-900/30 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('mapa')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-all rounded-xl ${
            activeTab === 'mapa'
              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Mapa de Controle & Alertas
        </button>

        <button
          onClick={() => setActiveTab('componentes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-all rounded-xl ${
            activeTab === 'componentes'
              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Componentes Controlados ({componentes.length})
        </button>

        <button
          onClick={() => setActiveTab('voos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-all rounded-xl ${
            activeTab === 'voos'
              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <History className="w-4 h-4" />
          Diário de Bordo ({voos.length})
        </button>

        <button
          onClick={() => setActiveTab('laudos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-all rounded-xl ${
            activeTab === 'laudos'
              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <FileText className="w-4 h-4" />
          Laudos & Inspeções ({revisoes.length})
        </button>
      </div>

      {/* --- CONTEÚDO DA TAB --- */}
      <div className="bg-slate-800/20 rounded-2xl border border-slate-700/50 p-6 shadow-xl" id="tab-content" style={{ contentVisibility: 'auto' }}>
        
        {/* LOADING STATE */}
        {loading && (
          <div className="py-12 text-center text-xs text-slate-500 font-mono">
            Carregando dados da aeronave...
          </div>
        )}

        {/* --- TAB 1: MAPA DE CONTROLE --- */}
        {!loading && activeTab === 'mapa' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-white tracking-tight">Inspeções Periódicas & Gargalos</h3>
                <p className="text-xs text-slate-400">Status automatizado com base nas horas de voo atuais ({aeronave.horasTotais.toFixed(1)} hs)</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Filtro do Alerta */}
                <select
                  value={alertFilter}
                  onChange={(e) => setAlertFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-xl text-xs px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="todos">Todos Componentes</option>
                  <option value="critico">⚠️ Vencidos ou Críticos</option>
                  <option value="atencao">⚡ Próximos do limite</option>
                </select>

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 text-slate-250 border border-slate-700 font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                  title="Imprimir Mapa"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Gerar Relatório</span>
                </button>
              </div>
            </div>

            {alertasFiltrados.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-6 text-slate-400 text-xs font-mono">
                {alertFilter === 'todos' 
                  ? 'Nenhum componente cadastrado para emissão de alertas.'
                  : 'Nenhum componente se enquadra no status selecionado.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5">
                {alertasFiltrados.map((al) => {
                  const compOriginal = componentes.find(c => c.id === al.idComponente)!;
                  
                  // Detalhes estéticos conforme nível de risco
                  let cardBorderClass = 'border-slate-800 bg-slate-900/10';
                  let bgAlertClass = 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20';
                  let textAlertClass = 'text-emerald-450 font-mono font-semibold';
                  let statusLabel = 'REGULAR';
                  
                  if (al.status === 'critico') {
                    cardBorderClass = 'border-red-500/40 bg-red-950/10 relative shadow-sm shadow-red-500/5';
                    bgAlertClass = 'bg-red-500/20 text-red-300 border border-red-500/30';
                    textAlertClass = 'text-red-400 font-extrabold font-mono';
                    statusLabel = '⚠️ CRÍTICO / VENCIDO';
                  } else if (al.status === 'atencao') {
                    cardBorderClass = 'border-amber-500/40 bg-amber-950/10 relative shadow-sm shadow-amber-500/5';
                    bgAlertClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
                    textAlertClass = 'text-amber-300 font-bold font-mono';
                    statusLabel = '⚡ ATENÇÃO / PRAZO PRÓXIMO';
                  }

                  return (
                    <div
                      key={al.idComponente}
                      className={`border rounded-2xl p-5 ${cardBorderClass} flex flex-col md:flex-row justify-between gap-5 transition-all`}
                      id={`alert-card-${al.idComponente}`}
                    >
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between md:justify-start gap-3">
                          <div>
                            <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase mb-1.5 ${bgAlertClass}`}>
                              {statusLabel}
                            </span>
                            <h4 className="font-display font-extrabold text-sm text-white tracking-tight leading-none">{al.nomeComponente}</h4>
                            <p className="text-[10px] text-slate-400 mt-1.5">
                              P/N: <strong className="text-slate-200">{compOriginal.partNumber || 'N/D'}</strong> • 
                              S/N: <strong className="text-slate-200">{compOriginal.serialNumber || 'N/D'}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Dados de referência */}
                        <div className="grid grid-cols-2 gap-4 text-xs bg-slate-900/50 p-3.5 rounded-xl border border-slate-750/30">
                          <div>
                            <span className="text-slate-405 text-[10px] block font-semibold mb-1">Última Revisão Realizada</span>
                            <span className="font-semibold text-slate-200 mt-0.5 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              {formatDataBR(al.dataUltima)}
                            </span>
                            <span className="text-[10px] text-slate-505 italic block mt-0.5">Com {al.horasUltima.toFixed(1)} hs voo</span>
                          </div>
                          <div>
                            <span className="text-slate-405 text-[10px] block font-semibold mb-1">Vencimento Planejado</span>
                            {al.metric !== 'horas' && (
                              <span className="font-semibold text-slate-200 mt-0.5 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                {formatDataBR(al.dataVencimento)}
                              </span>
                            )}
                            {al.metric !== 'dias' && (
                              <span className="font-semibold text-slate-200 mt-0.5 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                {al.horasLimite.toFixed(1)} hs voo
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Medidores de Margem */}
                      <div className="w-full md:w-80 flex flex-col justify-center space-y-4 border-t pt-4 md:border-t-0 md:pt-0 border-slate-800/60">
                        
                        {/* Margem de Horas */}
                        {(al.metric === 'horas' || al.metric === 'ambas') && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400 text-[10px] uppercase font-bold">Margem por Horas de Voo</span>
                              <span className={textAlertClass}>
                                {al.horasRestantes <= 0 ? 'Vencido!' : `${al.horasRestantes.toFixed(1)} hs restantes`}
                              </span>
                            </div>
                            
                            {/* Barra de Progresso */}
                            <div className="w-full bg-slate-950/80 rounded-full h-2.5 overflow-hidden border border-slate-800/80">
                              <div
                                className={`h-full rounded-full ${al.status === 'critico' ? 'bg-red-500' : al.status === 'atencao' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.max(0, Math.min(100, (al.horasRestantes / compOriginal.limiteHoras) * 100))}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-500 font-medium font-mono">
                              <span>Instalado: {compOriginal.horasInstalacao} hs</span>
                              <span>Intervalo: {compOriginal.limiteHoras} hs</span>
                            </div>
                          </div>
                        )}

                        {/* Margem de Dias */}
                        {(al.metric === 'dias' || al.metric === 'ambas') && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400 text-[10px] uppercase font-bold">Margem Calendária (Dias)</span>
                              <span className={textAlertClass}>
                                {al.diasRestantes <= 0 ? 'Vencido!' : `${al.diasRestantes} dias restantes`}
                              </span>
                            </div>
                            
                            {/* Barra de Progresso */}
                            <div className="w-full bg-slate-950/80 rounded-full h-2.5 overflow-hidden border border-slate-800/80">
                              <div
                                className={`h-full rounded-full ${al.status === 'critico' ? 'bg-red-500' : al.status === 'atencao' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.max(0, Math.min(100, (al.diasRestantes / compOriginal.limiteDias) * 100))}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-500 font-medium font-mono">
                              <span>Prazo: {compOriginal.limiteDias} dias</span>
                              <span>Vencimento: {formatDataBR(al.dataVencimento)}</span>
                            </div>
                          </div>
                        )}

                        {/* Botão Ação Rápida */}
                        <div className="pt-2 text-right">
                          <button
                            onClick={() => openRevisaoForComponente(compOriginal)}
                            className="inline-flex items-center gap-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-bold py-1.5 px-3 rounded-xl border border-sky-500/25 transition-all cursor-pointer"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            Iniciar Revisão / Laudo
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- TAB 2: COMPONENTES CONTROLADOS --- */}
        {!loading && activeTab === 'componentes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-display font-bold text-white tracking-tight">Componentes e Peças Controladas</h3>
                <p className="text-xs text-slate-400">Cadastre as peças que possuem desgaste por horas de voo ou tempo limite.</p>
              </div>
              <button
                onClick={() => { setCompEditing(null); setIsCompFormOpen(true); }}
                className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-sky-500/10"
              >
                <Plus className="w-4 h-4" />
                Cadastrar Componente
              </button>
            </div>

            {componentes.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-8 text-slate-400 text-xs font-mono">
                Nenhum componente mapeado nesta aeronave. Inicie o rastreamento clicando no botão acima!
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-700/50 rounded-2xl bg-slate-900/30">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-800/45 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-705/35">
                      <th className="p-4">Componente</th>
                      <th className="p-4">P/N e S/N</th>
                      <th className="p-4">Limites Fixados</th>
                      <th className="p-4">Instalação na Aeronave</th>
                      <th className="p-4">Última Revisão Realizada</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {componentes.map((c) => {
                      const alerta = calcularAlerta(c, aeronave);
                      return (
                        <tr key={c.id} className="hover:bg-slate-850/40 transition-colors" id={`comp-row-${c.id}`}>
                          <td className="p-4 font-semibold text-white">
                            <div className="flex items-center gap-2.5">
                              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 animate-pulse ${
                                alerta.status === 'critico' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : alerta.status === 'atencao' ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                              }`} title={`Status: ${alerta.status}`}></span>
                              <span>{c.nome}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="space-y-0.5 font-mono text-[11px] text-slate-400">
                              <div>P/N: <strong className="text-slate-200">{c.partNumber || '-'}</strong></div>
                              <div>S/N: <strong className="text-slate-200">{c.serialNumber || '-'}</strong></div>
                            </div>
                          </td>
                          <td className="p-4 font-semibold text-slate-200">
                            <div className="space-y-0.5">
                              {c.limiteHoras > 0 && <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-sky-400" /> {c.limiteHoras} hs voo</div>}
                              {c.limiteDias > 0 && <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-sky-400" /> {c.limiteDias} dias can.</div>}
                              {c.limiteHoras === 0 && c.limiteDias === 0 && <span className="text-slate-500 italic font-medium">Livre / Não param.</span>}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="space-y-0.5 text-slate-300">
                              <div>{formatDataBR(c.dataInstalacao)}</div>
                              <div className="text-slate-500 text-[10px] font-mono">Com {c.horasInstalacao} hs voo</div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="space-y-0.5 text-slate-300">
                              <div>{formatDataBR(c.ultimaRevisaoData)}</div>
                              <div className="text-slate-500 text-[10px] font-mono">Aos {c.ultimaRevisaoHoras} hs voo</div>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openRevisaoForComponente(c)}
                                className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Anexar Revisão"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleEditComponente(c)}
                                className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Editar"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteComponente(c.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Modal de Cadastro de Componente */}
            {isCompFormOpen && (
              <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-700 overflow-hidden">
                  <div className="bg-slate-800 px-5 py-4 text-white border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-display font-semibold text-sm">
                      {compEditing ? 'Editar Componente' : 'Novo Componente Controlado'}
                    </h3>
                    <button
                      onClick={() => setIsCompFormOpen(false)}
                      className="text-slate-405 hover:text-white transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <form onSubmit={handleSaveComponente} className="p-5 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Nome do Componente ou Peça *</label>
                        <input
                          type="text"
                          required
                          value={compNome}
                          onChange={(e) => setCompNome(e.target.value)}
                          placeholder="Ex: Magneto do Motor Esquerdo, Turbocompressor"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-medium placeholder-slate-650"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Part Number (P/N)</label>
                        <input
                          type="text"
                          value={compPartNumber}
                          onChange={(e) => setCompPartNumber(e.target.value)}
                          placeholder="Ex: PN-90234"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-650"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Serial Number (S/N)</label>
                        <input
                          type="text"
                          value={compSerialNumber}
                          onChange={(e) => setCompSerialNumber(e.target.value)}
                          placeholder="Ex: SN-54231-G"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-650"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-950/50 p-4.5 rounded-xl space-y-4 border border-slate-800">
                      <p className="text-[10px] uppercase font-black tracking-widest text-sky-400 font-mono">Parâmetros de Limites e Vencimentos</p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Limite por Horas Voadas</label>
                          <input
                            type="number"
                            value={compLimiteHoras}
                            onChange={(e) => setCompLimiteHoras(Number(e.target.value))}
                            min={0}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono"
                          />
                          <span className="text-[9px] text-slate-500 italic mt-1 block leading-normal">Zere se não for controlado por horas</span>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Limite por Dias Calendário</label>
                          <input
                            type="number"
                            value={compLimiteDias}
                            onChange={(e) => setCompLimiteDias(Number(e.target.value))}
                            min={0}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono"
                          />
                          <span className="text-[9px] text-slate-500 italic mt-1 block leading-normal">Zere se não houver validade temporal</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-405 mb-1">Data da Instalação *</label>
                        <input
                          type="date"
                          required
                          value={compDataInstalacao}
                          onChange={(e) => setCompDataInstalacao(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-405 mb-1">H.V. da Aeronave na Instalação *</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={compHorasInstalacao}
                          onChange={(e) => setCompHorasInstalacao(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-405 mb-1">Data Última Revisão *</label>
                        <input
                          type="date"
                          required
                          value={compUltimaRevisaoData}
                          onChange={(e) => setCompUltimaRevisaoData(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-405 mb-1">H.V. Aeronave na Última Revisão *</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={compUltimaRevisaoHoras}
                          onChange={(e) => setCompUltimaRevisaoHoras(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsCompFormOpen(false)}
                        className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2.5 text-xs font-medium text-white bg-sky-500 hover:bg-sky-650 rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10"
                      >
                        {compEditing ? 'Salvar Edição' : 'Cadastrar Componente'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TAB 3: DIÁRIO DE VOO (HISTÓRICO) --- */}
        {!loading && activeTab === 'voos' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-display font-bold text-white tracking-tight">Diário de Bordo / Histórico de Voos</h3>
                <p className="text-xs text-slate-400">Registre os voos efetuados. As horas são automaticamente integradas ao contador geral para calcular os alertas de manutenção.</p>
              </div>
              <button
                onClick={() => {
                  setVooData(new Date().toISOString().split('T')[0]);
                  setIsVooFormOpen(true);
                }}
                className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-sky-500/10"
              >
                <Plus className="w-4 h-4" />
                Registrar Novo Voo
              </button>
            </div>

            {voos.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-8 text-slate-400 text-xs font-mono">
                Nenhum voo registrado no diário de bordo. Adicione registros para atualizar o tempo em serviço.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-700/50 rounded-2xl bg-slate-900/30">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-800/45 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-705/35">
                      <th className="p-4">Data do Voo</th>
                      <th className="p-4">Piloto em Comando</th>
                      <th className="p-4">Duração (Horas)</th>
                      <th className="p-4">Roteiro / Observações</th>
                      <th className="p-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {voos.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-850/40 transition-colors" id={`voo-row-${v.id}`}>
                        <td className="p-4 font-bold text-white">
                          <span className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-sky-400" />
                            {formatDataBR(v.data)}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="flex items-center gap-1.5 font-medium text-slate-200">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>{v.piloto || 'N/D'}</span>
                          </span>
                        </td>
                        <td className="p-4 font-black text-sky-400 text-[13px] font-mono">{v.horasVoo.toFixed(1)} hs</td>
                        <td className="p-4 text-slate-400 font-medium italic">{v.descricao || '-'}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteVoo(v.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Excluir Diário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Modal para Adicionar Voo */}
            {isVooFormOpen && (
              <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden">
                  <div className="bg-slate-800 px-5 py-4 text-white border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-display font-semibold text-sm">Registrar Registro de Voo</h3>
                    <button
                      onClick={() => setIsVooFormOpen(false)}
                      className="text-slate-405 hover:text-white transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <form onSubmit={handleAddVoo} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Data do Voo *</label>
                        <input
                          type="date"
                          required
                          value={vooData}
                          onChange={(e) => setVooData(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Duração de Voo (Hs) *</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          min={0.1}
                          value={vooHoras}
                          onChange={(e) => setVooHoras(Number(e.target.value))}
                          placeholder="Ex: 2.3"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Piloto em Comando (PIC) *</label>
                      <input
                        type="text"
                        required
                        value={vooPiloto}
                        onChange={(e) => setVooPiloto(e.target.value)}
                        placeholder="Ex: Almirante Nelson"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-650"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Roteiro / Descrição do Diário</label>
                      <textarea
                        value={vooDescricao}
                        onChange={(e) => setVooDescricao(e.target.value)}
                        placeholder="Ex: Translado SBSP - SBGL. Condições meteorológicas normais, voo VFR."
                        rows={3}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-650"
                      ></textarea>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsVooFormOpen(false)}
                        className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2.5 text-xs font-medium text-white bg-sky-500 hover:bg-sky-650 rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10"
                      >
                        Adicionar ao Diário
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TAB 4: LAUDOS E INSPEÇÕES --- */}
        {!loading && activeTab === 'laudos' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-display font-bold text-white tracking-tight">Fichas de Revisão e Laudos das Peças</h3>
                <p className="text-xs text-slate-400">Registre revisões, vistorias (Preventivas/Corretivas) e anexe os laudos físicos assinados.</p>
              </div>
              <button
                onClick={() => {
                  setRevHoras(aeronave.horasTotais);
                  setIsRevFormOpen(true);
                }}
                className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-sky-500/10"
              >
                <Plus className="w-4 h-4" />
                Registrar Revisão ou Laudo
              </button>
            </div>

            {revisoes.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-8 text-slate-400 text-xs font-mono">
                Nenhum laudo ou revisão registrados. Clique no botão acima para adicionar a ficha técnica com anexo.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {revisoes.map((r) => {
                  const compAssociado = componentes.find(c => c.id === r.componenteId);
                  return (
                    <div
                      key={r.id}
                      className="bg-slate-900 border border-slate-700/65 rounded-2xl p-4.5 hover:shadow-lg hover:shadow-sky-500/2 transition-all flex flex-col justify-between shadow-md"
                      id={`rev-card-${r.id}`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider ${
                            r.tipo === 'preventiva' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800' : r.tipo === 'corretiva' ? 'bg-red-950/40 text-red-400 border border-red-800' : 'bg-sky-950/40 text-sky-400 border border-sky-800'
                          }`}>
                            REVISÃO {r.tipo}
                          </span>
                          <span className="text-slate-400 text-[10px] font-mono">{formatDataBR(r.data)}</span>
                        </div>

                        <div className="text-xs">
                          {compAssociado ? (
                            <p className="font-extrabold text-white flex items-center gap-1.5">
                              <Wrench className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                              Componente: {compAssociado.nome}
                            </p>
                          ) : (
                            <p className="font-extrabold text-white flex items-center gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              Revisão Especial de Célula / Geral
                            </p>
                          )}
                          <p className="text-slate-500 text-[10px] mt-0.5 font-mono">Efetuada aos {r.horasNaRevisao.toFixed(1)} hs voo</p>
                        </div>

                        <p className="text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 font-medium italic">
                          {r.descricao}
                        </p>
                      </div>

                      <div className="border-t border-slate-800/60 mt-4 pt-3 flex items-center justify-between">
                        {r.nomeAnexo && r.dadosAnexo ? (
                          <a
                            href={r.dadosAnexo}
                            download={r.nomeAnexo}
                            className="inline-flex items-center gap-1.5 text-xs text-sky-400 font-bold hover:text-sky-350 transition-colors"
                            title="Baixar Anexo"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[150px]">{r.nomeAnexo}</span>
                            <Download className="w-3 h-3 text-sky-400 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Nenhum laudo digital anexado</span>
                        )}

                        <button
                          onClick={() => handleDeleteRevisao(r.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors border-0"
                          title="Excluir Registro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Modal de Cadastrar Revisão ou Laudo */}
            {isRevFormOpen && (
              <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-700 overflow-hidden">
                  <div className="bg-slate-800 px-5 py-4 text-white border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-display font-semibold text-sm">Registrar Revisão e Anexar Laudo Físico</h3>
                    <button
                      onClick={() => setIsRevFormOpen(false)}
                      className="text-slate-405 hover:text-white transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <form onSubmit={handleAddRevisao} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Componente Alvo</label>
                        <select
                          value={revComponenteId}
                          onChange={(e) => setRevComponenteId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                        >
                          <option value="" className="bg-slate-900">-- Aeronave Geral (Geral ou Célula) --</option>
                          {componentes.map(comp => (
                            <option key={comp.id} value={comp.id} className="bg-slate-900">Peça: {comp.nome} (P/N: {comp.partNumber || 'ND'})</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo de Manutenção *</label>
                        <select
                          required
                          value={revTipo}
                          onChange={(e) => setRevTipo(e.target.value as any)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                        >
                          <option value="periodica" className="bg-slate-900">Periódica / Preventiva Requerida</option>
                          <option value="preventiva" className="bg-slate-900">Inspeção Preventiva Opcional</option>
                          <option value="corretiva" className="bg-slate-900">Manutenção Corretiva (Substituição de Peça)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Data da Execução *</label>
                        <input
                          type="date"
                          required
                          value={revData}
                          onChange={(e) => setRevData(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">H.V. da Aeronave na Revisão *</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={revHoras}
                          onChange={(e) => setRevHoras(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Laudo Descritivo / Serviços Executados *</label>
                      <textarea
                        required
                        value={revDescricao}
                        onChange={(e) => setRevDescricao(e.target.value)}
                        placeholder="Descreva detalhadamente o serviço realizado. Ex: Efetuado abertura do magneto, limpeza de platinados, aferição e re-torque com troca da gaxeta de vedação..."
                        rows={3}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-650"
                      ></textarea>
                    </div>

                    {/* upload area */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Anexar Laudo Técnico ou Recibo de Peça (PDF ou Imagem)</label>
                      <div className="border border-dashed border-slate-705 rounded-xl p-4 bg-slate-955/20 text-center relative hover:bg-slate-950/40 transition-colors">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={handleFileChange}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="space-y-1">
                          <Upload className="w-5 h-5 text-slate-500 mx-auto" />
                          <p className="text-[11px] text-slate-300">
                            {attachmentName ? (
                              <strong className="text-slate-100 flex items-center justify-center gap-1">
                                <Paperclip className="w-3 h-3 text-sky-400" />
                                {attachmentName} (Alterar)
                              </strong>
                            ) : (
                              'Clique ou arraste o arquivo aqui para fazer o upload'
                            )}
                          </p>
                          <p className="text-[9px] text-slate-500">Tamanho máximo recomendado: 15MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsRevFormOpen(false)}
                        className="px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2.5 text-xs font-medium text-white bg-sky-500 hover:bg-sky-655 rounded-xl transition-all cursor-pointer shadow-md shadow-sky-500/10"
                      >
                        Salvar laudo de Revisão
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

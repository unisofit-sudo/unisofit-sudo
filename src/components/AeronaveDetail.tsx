/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Aeronave, Cliente, HistoricoVoo, ComponenteControlado, InspecaoPeriodica, RevisaoLaudo, AnexoComponente } from '../types';
import { calcularAlerta, calcularTodosAlertas, calcularAlertaInspecao, calcularTodosAlertasInspecoes, formatDataBR, obterDataHojeISO } from '../utils';
import {
  getAeronaveDetailCache,
  saveAeronaveDetailCache,
  queuePendingVoo,
  getPendingVoos,
  removePendingVoo,
  OFFLINE_EVENTS,
} from '../utils/offlineStore';
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
  FileSpreadsheet,
  X,
  Eye,
  ClipboardCheck,
  CloudUpload
} from 'lucide-react';

interface AeronaveDetailProps {
  aeronave: Aeronave;
  cliente: Cliente;
  onRefreshAeronave: () => void;
  userRole?: 'admin' | 'cliente' | 'oficina' | 'piloto' | null;
  pilotoUser?: { id: string; nome: string; email: string; canac?: string } | null;
}

export default function AeronaveDetail({
  aeronave,
  cliente,
  onRefreshAeronave,
  userRole,
  pilotoUser
}: AeronaveDetailProps) {
  const isPilotOnly = userRole === 'piloto';
  const [activeTab, setActiveTab] = useState<'mapa' | 'componentes' | 'inspecoes' | 'voos' | 'laudos'>(
    isPilotOnly ? 'voos' : 'mapa'
  );

  useEffect(() => {
    if (isPilotOnly && activeTab !== 'voos') {
      setActiveTab('voos');
    }
  }, [isPilotOnly, activeTab]);
  
  // Dados dinâmicos buscados do servidor
  const [componentes, setComponentes] = useState<ComponenteControlado[]>([]);
  const [inspecoes, setInspecoes] = useState<InspecaoPeriodica[]>([]);
  const [voos, setVoos] = useState<HistoricoVoo[]>([]);
  const [revisoes, setRevisoes] = useState<RevisaoLaudo[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertFilter, setAlertFilter] = useState<'todos' | 'critico' | 'atencao'>('todos');
  const [mapaSistemaFilter, setMapaSistemaFilter] = useState<'todos' | 'celula' | 'motor' | 'helice'>('todos');
  const [compSistemaFilter, setCompSistemaFilter] = useState<'todos' | 'celula' | 'motor' | 'helice'>('todos');
  const [inspSistemaFilter, setInspSistemaFilter] = useState<'todos' | 'celula' | 'motor'>('todos');

  // Formulário: Diário de Bordo (Voo)
  const [isVooFormOpen, setIsVooFormOpen] = useState(false);
  const [vooData, setVooData] = useState(obterDataHojeISO());
  const [vooDe, setVooDe] = useState('');
  const [vooPara, setVooPara] = useState('');
  const [vooPartida, setVooPartida] = useState('');
  const [vooDecolagem, setVooDecolagem] = useState('');
  const [vooPouso, setVooPouso] = useState('');
  const [vooCorte, setVooCorte] = useState('');
  const [vooPax, setVooPax] = useState('');
  const [vooPc, setVooPc] = useState('');
  const [vooPiloto, setVooPiloto] = useState('');
  const [vooCanac, setVooCanac] = useState('');
  const [vooDescricao, setVooDescricao] = useState('');
  const [vooFormError, setVooFormError] = useState('');
  const [vooListNotice, setVooListNotice] = useState<{ type: 'info' | 'warning'; text: string } | null>(null);

  const formatTimeHHMM = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  };

  const isValidHHMM = (val: string): boolean => {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(val);
  };

  const calcularDuracaoDecimal = (partida: string, corte: string): number => {
    if (!isValidHHMM(partida) || !isValidHHMM(corte)) return 0;
    const [pH, pM] = partida.split(':').map(Number);
    const [cH, cM] = corte.split(':').map(Number);
    const startMin = pH * 60 + pM;
    let endMin = cH * 60 + cM;
    if (endMin < startMin) {
      endMin += 24 * 60; // Voo que vira a meia-noite
    }
    const diffMin = endMin - startMin;
    return Number((diffMin / 60).toFixed(2));
  };

  const vooHorasCalculado = calcularDuracaoDecimal(vooPartida, vooCorte);

  // Formulário: Cadastrar Componente
  const [isCompFormOpen, setIsCompFormOpen] = useState(false);
  const [compEditing, setCompEditing] = useState<ComponenteControlado | null>(null);
  const [compNome, setCompNome] = useState('');
  const [compPartNumber, setCompPartNumber] = useState('');
  const [compSerialNumber, setCompSerialNumber] = useState('');
  const [compLimiteHoras, setCompLimiteHoras] = useState(500);
  const [compLimiteDias, setCompLimiteDias] = useState(365);
  const [compSistema, setCompSistema] = useState<'celula' | 'motor' | 'helice'>('celula');
  const [compHorasInstalacao, setCompHorasInstalacao] = useState(aeronave.horasTotais);
  const [compHorasInstalacaoMotor, setCompHorasInstalacaoMotor] = useState(aeronave.horasMotor);
  const [compHorasInstalacaoHelice, setCompHorasInstalacaoHelice] = useState(aeronave.horasHelice);
  const [compDataInstalacao, setCompDataInstalacao] = useState(new Date().toISOString().split('T')[0]);
  const [compUltimaRevisaoHoras, setCompUltimaRevisaoHoras] = useState(0);
  const [compUltimaRevisaoData, setCompUltimaRevisaoData] = useState(new Date().toISOString().split('T')[0]);
  const [compAttachments, setCompAttachments] = useState<AnexoComponente[]>([]);
  const [compMarca, setCompMarca] = useState('');
  const [compOficinaExecutante, setCompOficinaExecutante] = useState('');
  const [compCondicao, setCompCondicao] = useState<'novo' | 'overhaul'>('novo');

  const getAeronaveHoursForSistema = (sistema: 'celula' | 'motor' | 'helice') => {
    if (sistema === 'motor') return aeronave.horasMotor || 0;
    if (sistema === 'helice') return aeronave.horasHelice || 0;
    return aeronave.horasTotais || 0;
  };

  // Formulário: Inspeções Periódicas
  const [isInspFormOpen, setIsInspFormOpen] = useState(false);
  const [inspEditing, setInspEditing] = useState<InspecaoPeriodica | null>(null);
  const [inspNome, setInspNome] = useState('');
  const [inspSistema, setInspSistema] = useState<'celula' | 'motor'>('celula');
  const [inspConteudo, setInspConteudo] = useState('');
  const [inspObservacao, setInspObservacao] = useState('');
  const [inspLimiteHoras, setInspLimiteHoras] = useState(50);
  const [inspLimiteDias, setInspLimiteDias] = useState(365);
  const [inspDataRealizacao, setInspDataRealizacao] = useState(obterDataHojeISO());
  const [inspHorasCelula, setInspHorasCelula] = useState(aeronave.horasTotais);
  const [inspHorasMotor, setInspHorasMotor] = useState(aeronave.horasMotor || 0);
  const [inspOficinaExecutante, setInspOficinaExecutante] = useState('');

  // Formulário: Nova Revisão / Carga de Laudo
  const [isRevFormOpen, setIsRevFormOpen] = useState(false);
  const [revData, setRevData] = useState(new Date().toISOString().split('T')[0]);
  const [revHoras, setRevHoras] = useState(aeronave.horasTotais);
  const [revTipo, setRevTipo] = useState<'preventiva' | 'corretiva' | 'periodica'>('periodica');
  const [revDescricao, setRevDescricao] = useState('');
  const [revComponenteId, setRevComponenteId] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentData, setAttachmentData] = useState('');

  // --- CARGA DE DADOS (COM CACHE OFFLINE + FILA DE VOOS PENDENTES) ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    const pendingForAircraft = await getPendingVoos(aeronave.id);
    const pendingOrdered = [...pendingForAircraft].reverse();

    const applyOfflineFallback = async () => {
      const cached = await getAeronaveDetailCache(aeronave.id);
      if (cached) {
        setComponentes(cached.componentes);
        setInspecoes(cached.inspecoes);
        const serverIds = new Set(cached.voos.map((v) => v.id));
        const onlyPending = pendingOrdered.filter((p) => !serverIds.has(p.id));
        setVoos([...onlyPending, ...cached.voos]);
        setRevisoes(cached.revisoes);
      } else {
        setVoos(pendingOrdered);
      }
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await applyOfflineFallback();
      setLoading(false);
      return;
    }

    try {
      const [compRes, inspRes, voosRes, revRes] = await Promise.all([
        fetch(`/api/componentes?aeronaveId=${aeronave.id}`),
        fetch(`/api/inspecoes-periodicas?aeronaveId=${aeronave.id}`),
        fetch(`/api/historico?aeronaveId=${aeronave.id}`),
        fetch(`/api/revisoes?aeronaveId=${aeronave.id}`)
      ]);
      
      if (compRes.ok && inspRes.ok && voosRes.ok && revRes.ok) {
        const [compData, inspData, voosData, revData] = await Promise.all([
          compRes.json(),
          inspRes.json(),
          voosRes.json(),
          revRes.json(),
        ]);

        setComponentes(compData);
        setInspecoes(inspData);
        setRevisoes(revData);

        const serverIds = new Set((voosData as HistoricoVoo[]).map((v) => v.id));
        const onlyPending = pendingOrdered.filter((p) => !serverIds.has(p.id));
        setVoos([...onlyPending, ...voosData]);

        void saveAeronaveDetailCache(aeronave.id, {
          componentes: compData,
          inspecoes: inspData,
          voos: voosData,
          revisoes: revData,
        });
      } else {
        await applyOfflineFallback();
      }
    } catch (error) {
      console.error('Erro ao buscar dados na detalhadora (usando cache offline):', error);
      await applyOfflineFallback();
    } finally {
      setLoading(false);
    }
  }, [aeronave.id]);

  useEffect(() => {
    void fetchData();

    const onSyncOrPending = () => {
      void fetchData();
    };
    window.addEventListener(OFFLINE_EVENTS.SYNC_COMPLETE, onSyncOrPending);
    window.addEventListener(OFFLINE_EVENTS.PENDING_CHANGED, onSyncOrPending);
    return () => {
      window.removeEventListener(OFFLINE_EVENTS.SYNC_COMPLETE, onSyncOrPending);
      window.removeEventListener(OFFLINE_EVENTS.PENDING_CHANGED, onSyncOrPending);
    };
  }, [fetchData]);

  // Calcula os alertas com base nas horas atuais da aeronave (Componentes + Inspeções Periódicas)
  const alertasComponentes = calcularTodosAlertas(componentes, aeronave);
  const alertasInspecoes = calcularTodosAlertasInspecoes(inspecoes, aeronave);
  const alertas = [...alertasComponentes, ...alertasInspecoes];
  const alertasPorStatus = alertas.filter(a => {
    if (alertFilter === 'critico') return a.status === 'critico';
    if (alertFilter === 'atencao') return a.status === 'atencao';
    return true;
  });
  const alertasFiltrados = alertasPorStatus.filter(a => {
    const sis = a.sistema || 'celula';
    if (mapaSistemaFilter !== 'todos') return sis === mapaSistemaFilter;
    return true;
  });

  const countCriticos = alertas.filter(a => a.status === 'critico').length;
  const countAtencao = alertas.filter(a => a.status === 'atencao').length;

  // --- SUBMISSÃO DIÁRIO DE VOO ---
  const openNovoVoo = () => {
    setVooData(obterDataHojeISO());
    setVooDe('');
    setVooPara('');
    setVooPartida('');
    setVooDecolagem('');
    setVooPouso('');
    setVooCorte('');
    setVooPax('');
    setVooPc('');
    setVooPiloto(pilotoUser?.nome || '');
    setVooCanac(pilotoUser?.canac || '');
    setVooDescricao('');
    setVooFormError('');
    setIsVooFormOpen(true);
  };

  const handleAddVoo = async (e: React.FormEvent) => {
    e.preventDefault();
    setVooFormError('');

    const deClean = vooDe.trim().toUpperCase();
    const paraClean = vooPara.trim().toUpperCase();

    if (deClean.length !== 4 || paraClean.length !== 4) {
      setVooFormError('Os campos "De" e "Para" devem conter exatamente 4 caracteres.');
      return;
    }

    if (!isValidHHMM(vooPartida) || !isValidHHMM(vooDecolagem) || !isValidHHMM(vooPouso) || !isValidHHMM(vooCorte)) {
      setVooFormError('Preencha Partida, Decolagem, Pouso e Corte no formato válido HH:MM (ex: 08:30).');
      return;
    }

    if (vooCanac.trim() && vooCanac.trim().length !== 6) {
      setVooFormError('O campo CANAC deve conter exatamente 6 números.');
      return;
    }

    const duracaoDecimal = calcularDuracaoDecimal(vooPartida, vooCorte);
    if (duracaoDecimal <= 0) {
      setVooFormError('A duração calculada entre Partida e Corte deve ser maior que 0.');
      return;
    }

    const vooPayload: HistoricoVoo = {
      id: `voo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      aeronaveId: aeronave.id,
      data: vooData,
      de: deClean,
      para: paraClean,
      partida: vooPartida,
      decolagem: vooDecolagem,
      pouso: vooPouso,
      corte: vooCorte,
      pax: vooPax !== '' ? Number(vooPax) : 0,
      pc: vooPc !== '' ? Number(vooPc) : 0,
      canac: vooCanac.trim() || undefined,
      horasVoo: duracaoDecimal,
      piloto: vooPiloto.trim(),
      descricao: vooDescricao.trim()
    };

    const resetVooFormAndRefresh = () => {
      setIsVooFormOpen(false);
      setVooDe('');
      setVooPara('');
      setVooPartida('');
      setVooDecolagem('');
      setVooPouso('');
      setVooCorte('');
      setVooPax('');
      setVooPc('');
      setVooPiloto('');
      setVooCanac('');
      setVooDescricao('');
      onRefreshAeronave();
      void fetchData();
    };

    const saveOffline = async () => {
      await queuePendingVoo(vooPayload);
      setVooListNotice({
        type: 'info',
        text: `Voo salvo offline (${duracaoDecimal.toFixed(2)} hs Partida → Corte). As horas de Célula, Motor e Hélice já foram atualizadas nos alertas e serão sincronizadas automaticamente ao reconectar.`,
      });
      resetVooFormAndRefresh();
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await saveOffline();
      return;
    }

    try {
      const response = await fetch('/api/historico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vooPayload)
      });
      if (response.ok) {
        setVooListNotice(null);
        resetVooFormAndRefresh();
      } else if (response.status >= 500) {
        await saveOffline();
      } else {
        const errData = await response.json().catch(() => null);
        setVooFormError(errData?.error || 'Não foi possível registrar o voo.');
      }
    } catch (e) {
      console.warn('Sem conexão com o servidor, salvando voo na fila offline:', e);
      await saveOffline();
    }
  };

  const handleDeleteVoo = async (id: string, isPending?: boolean) => {
    if (isPending) {
      if (confirm('Remover este voo da fila offline? Ele ainda não foi enviado ao servidor e suas horas serão revertidas.')) {
        await removePendingVoo(id);
        onRefreshAeronave();
        void fetchData();
      }
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setVooListNotice({
        type: 'warning',
        text: 'Para excluir um voo já sincronizado com o banco de dados, é necessário estar conectado à internet.',
      });
      return;
    }

    if (confirm('Tem certeza de que deseja remover este registro de voo? As horas acumuladas da aeronave serão ajustadas automaticamente.')) {
      try {
        const res = await fetch(`/api/historico/${id}`, { method: 'DELETE' });
        if (res.ok) {
          onRefreshAeronave();
          void fetchData();
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

    // Salva exatamente as horas informadas de uso acumulado do componente
    const dbUltimaRevisaoHoras = compCondicao === 'novo' ? 0 : Number(compUltimaRevisaoHoras || 0);
    const dbUltimaRevisaoData = compCondicao === 'novo' ? compDataInstalacao : (compUltimaRevisaoData || compDataInstalacao);

    const compPayload = {
      id: compEditing?.id,
      aeronaveId: aeronave.id,
      nome: compNome.trim(),
      partNumber: compPartNumber.trim(),
      serialNumber: compSerialNumber.trim(),
      limiteHoras: Number(compLimiteHoras || 0),
      limiteDias: Number(compLimiteDias || 0),
      horasInstalacao: Number(compHorasInstalacao || 0),
      horasInstalacaoMotor: Number(compHorasInstalacaoMotor || 0),
      horasInstalacaoHelice: Number(compHorasInstalacaoHelice || 0),
      dataInstalacao: compDataInstalacao,
      ultimaRevisaoHoras: dbUltimaRevisaoHoras,
      ultimaRevisaoData: dbUltimaRevisaoData,
      anexos: compAttachments,
      nomeAnexo: compAttachments[0]?.nome || undefined,
      dadosAnexo: compAttachments[0]?.dados || undefined,
      marca: compMarca.trim() || undefined,
      condicao: compCondicao,
      oficinaExecutante: compOficinaExecutante.trim() || undefined,
      sistema: compSistema
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
    setCompPartNumber(c.partNumber || '');
    setCompSerialNumber(c.serialNumber || '');
    setCompLimiteHoras(c.limiteHoras);
    setCompLimiteDias(c.limiteDias);
    setCompSistema(c.sistema || 'celula');
    setCompHorasInstalacao(c.horasInstalacao);
    setCompHorasInstalacaoMotor(c.horasInstalacaoMotor || 0);
    setCompHorasInstalacaoHelice(c.horasInstalacaoHelice || 0);
    setCompDataInstalacao(c.dataInstalacao);

    // Em representação direta, c.ultimaRevisaoHoras armazena diretamente as horas de uso do componente
    setCompUltimaRevisaoHoras(c.condicao === 'novo' ? 0 : c.ultimaRevisaoHoras);

    setCompUltimaRevisaoData(c.ultimaRevisaoData);
    const initialAttachments: AnexoComponente[] =
      c.anexos && c.anexos.length > 0
        ? c.anexos
        : c.nomeAnexo && c.dadosAnexo
        ? [{ nome: c.nomeAnexo, dados: c.dadosAnexo }]
        : [];
    setCompAttachments(initialAttachments);
    setCompMarca(c.marca || '');
    setCompOficinaExecutante(c.oficinaExecutante || '');
    setCompCondicao(c.condicao || 'novo');
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

  const handleCompFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const oversized = files.filter(f => f.size > 15 * 1024 * 1024);
    if (oversized.length > 0) {
      alert(`O(s) arquivo(s) ${oversized.map(f => f.name).join(', ')} excede(m) o limite recomendado de 15MB por arquivo e foi(ram) ignorado(s).`);
    }

    const validFiles = files.filter(f => f.size <= 15 * 1024 * 1024);
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        setCompAttachments(prev => [...prev, { nome: file.name, dados: data }]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveCompAttachment = (index: number) => {
    setCompAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const openNovoComponente = () => {
    setCompEditing(null);
    setCompNome('');
    setCompPartNumber('');
    setCompSerialNumber('');
    setCompLimiteHoras(500);
    setCompLimiteDias(365);
    setCompSistema('celula');
    setCompHorasInstalacao(aeronave.horasTotais);
    setCompHorasInstalacaoMotor(aeronave.horasMotor);
    setCompHorasInstalacaoHelice(aeronave.horasHelice);
    setCompDataInstalacao(new Date().toISOString().split('T')[0]);
    setCompUltimaRevisaoHoras(0);
    setCompUltimaRevisaoData(new Date().toISOString().split('T')[0]);
    setCompAttachments([]);
    setCompMarca('');
    setCompOficinaExecutante('');
    setCompCondicao('novo');
    setIsCompFormOpen(true);
  };

  // --- SUBMISSÃO INSPEÇÕES PERIÓDICAS ---
  const openNovaInspecao = () => {
    setInspEditing(null);
    setInspNome('');
    setInspSistema('celula');
    setInspConteudo('');
    setInspObservacao('');
    setInspLimiteHoras(50);
    setInspLimiteDias(365);
    setInspDataRealizacao(obterDataHojeISO());
    setInspHorasCelula(aeronave.horasTotais);
    setInspHorasMotor(aeronave.horasMotor || 0);
    setInspOficinaExecutante('');
    setIsInspFormOpen(true);
  };

  const handleEditInspecao = (insp: InspecaoPeriodica) => {
    setInspEditing(insp);
    setInspNome(insp.nome);
    setInspSistema(insp.sistema || 'celula');
    setInspConteudo(insp.conteudo || '');
    setInspObservacao(insp.observacao || '');
    setInspLimiteHoras(insp.limiteHoras || 0);
    setInspLimiteDias(insp.limiteDias || 0);
    setInspDataRealizacao(insp.dataRealizacao || obterDataHojeISO());
    setInspHorasCelula(insp.horasCelulaNaInspecao || 0);
    setInspHorasMotor(insp.horasMotorNaInspecao || 0);
    setInspOficinaExecutante(insp.oficinaExecutante || '');
    setIsInspFormOpen(true);
  };

  const handleSaveInspecao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspNome.trim()) return;

    const inspPayload = {
      id: inspEditing?.id,
      aeronaveId: aeronave.id,
      nome: inspNome.trim(),
      sistema: inspSistema,
      conteudo: inspConteudo.trim(),
      observacao: inspObservacao.trim() || undefined,
      limiteHoras: Number(inspLimiteHoras || 0),
      limiteDias: Number(inspLimiteDias || 0),
      dataRealizacao: inspDataRealizacao,
      horasCelulaNaInspecao: Number(inspHorasCelula || 0),
      horasMotorNaInspecao: inspSistema === 'motor' ? Number(inspHorasMotor || 0) : 0,
      oficinaExecutante: inspOficinaExecutante.trim() || undefined
    };

    try {
      const method = inspEditing ? 'PUT' : 'POST';
      const response = await fetch('/api/inspecoes-periodicas', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inspPayload)
      });
      if (response.ok) {
        setIsInspFormOpen(false);
        setInspEditing(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteInspecao = async (id: string) => {
    if (confirm('Deseja realmente remover esta inspeção periódica?')) {
      try {
        const res = await fetch(`/api/inspecoes-periodicas/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
      } catch (err) {
        console.error(err);
      }
    }
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
      <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50 shadow-xl overflow-hidden flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 w-full">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full inline-block">
                AERONAVE ATIVA
              </span>
              <span className="text-[11px] text-slate-400">Proprietário: <strong className="text-slate-200">{cliente.nome}</strong></span>
            </div>
            <h1 className="text-3xl font-display font-extrabold text-white tracking-tight flex flex-wrap items-center gap-2">
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
          
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-4 border border-slate-700/30 w-full md:w-auto flex items-center gap-4 flex-shrink-0">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20 self-center">
              <Gauge className="w-6 h-6" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-3 gap-x-4 divide-x divide-slate-800">
                <div className="pr-2">
                  <p className="text-[9px] text-sky-400 font-bold uppercase tracking-wider mb-0.5">Célula</p>
                  <p className="text-sm sm:text-base font-black text-slate-100">{aeronave.horasTotais.toFixed(1)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">hs</span></p>
                </div>
                <div className="px-3">
                  <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">Motor</p>
                  <p className="text-sm sm:text-base font-black text-slate-100">{(aeronave.horasMotor || 0).toFixed(1)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">hs</span></p>
                </div>
                <div className="pl-3">
                  <p className="text-[9px] text-amber-400 font-bold uppercase tracking-wider mb-0.5">Hélice</p>
                  <p className="text-sm sm:text-base font-black text-slate-100">{(aeronave.horasHelice || 0).toFixed(1)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">hs</span></p>
                </div>
              </div>
              <span className="text-[9px] text-slate-500 block leading-none">Tempo em Serviço (T.S.N.)</span>
            </div>
          </div>
        </div>

        {!isPilotOnly && (
          <>
            {/* Linha divisória discreta */}
            <div className="h-px bg-slate-700/20 w-full" />

            {/* Contador de Alertas Rápidos - Sem absolute para evitar escritos sobrepostos */}
            <div className="flex flex-wrap gap-4 text-[10px] uppercase font-bold tracking-wider">
              <div className="flex items-center gap-2 bg-slate-900/30 px-3 py-1.5 rounded-xl border border-slate-700/30 text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>Componentes Monitorados: <strong>{componentes.length}</strong></span>
              </div>

              <div className="flex items-center gap-2 bg-slate-900/30 px-3 py-1.5 rounded-xl border border-slate-700/30 text-slate-300">
                <span className="h-2 w-2 rounded-full bg-sky-500"></span>
                <span>Inspeções Periódicas: <strong>{inspecoes.length}</strong></span>
              </div>

              <button
                type="button"
                onClick={() => { setActiveTab('mapa'); setAlertFilter('critico'); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  countCriticos > 0 
                    ? 'bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25 animate-pulse' 
                    : 'bg-slate-900/30 border-slate-700/30 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${countCriticos > 0 ? 'bg-red-500' : 'bg-slate-600'}`}></span>
                <span>Vencidos / Críticos: <strong>{countCriticos}</strong></span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('mapa'); setAlertFilter('atencao'); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  countAtencao > 0 
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25' 
                    : 'bg-slate-900/30 border-slate-700/30 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${countAtencao > 0 ? 'bg-amber-400' : 'bg-slate-600'}`}></span>
                <span>Alerta de Atenção: <strong>{countAtencao}</strong></span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      {isPilotOnly ? (
        <div className="flex items-center justify-between bg-slate-900/40 border border-slate-700/40 px-4 py-3 rounded-2xl">
          <div className="flex items-center gap-2.5 text-sky-400 text-xs font-bold uppercase tracking-wider">
            <History className="w-4 h-4" />
            <span>Diário de Bordo Digital ({voos.length} registros)</span>
          </div>
          {pilotoUser?.nome && (
            <span className="text-[11px] text-slate-400">
              Piloto: <strong className="text-slate-200">{pilotoUser.nome}</strong>
              {pilotoUser.canac ? ` • CANAC ${pilotoUser.canac}` : ''}
            </span>
          )}
        </div>
      ) : (
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
            onClick={() => setActiveTab('inspecoes')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-all rounded-xl ${
              activeTab === 'inspecoes'
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Inspeções Periódicas ({inspecoes.length})
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
      )}

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
                <p className="text-xs text-slate-400">Status automatizado com base nas horas de voo atuais (Célula: {aeronave.horasTotais.toFixed(1)} hs • Motor: {(aeronave.horasMotor || 0).toFixed(1)} hs • Hélice: {(aeronave.horasHelice || 0).toFixed(1)} hs)</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Filtro do Alerta */}
                <select
                  value={alertFilter}
                  onChange={(e) => setAlertFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-xl text-xs px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="todos">Todos os Itens</option>
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

            {/* Filtro por Sistema (Célula / Motor / Hélice) */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-900/40 p-2 rounded-xl border border-slate-800/70 w-fit">
              {(
                [
                  { id: 'todos', label: 'Todos', count: alertasPorStatus.length, activeClass: 'bg-slate-700 text-white border-slate-500' },
                  { id: 'celula', label: 'Célula', count: alertasPorStatus.filter(a => (a.sistema || 'celula') === 'celula').length, activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
                  { id: 'motor', label: 'Motor', count: alertasPorStatus.filter(a => a.sistema === 'motor').length, activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
                  { id: 'helice', label: 'Hélice', count: alertasPorStatus.filter(a => a.sistema === 'helice').length, activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMapaSistemaFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    mapaSistemaFilter === opt.id
                      ? opt.activeClass
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className="text-[10px] font-mono opacity-80">({opt.count})</span>
                </button>
              ))}
            </div>

            {alertasFiltrados.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-6 text-slate-400 text-xs font-mono">
                {alertFilter === 'todos' && mapaSistemaFilter === 'todos'
                  ? 'Nenhum componente ou inspeção periódica cadastrado para emissão de alertas.'
                  : 'Nenhum item se enquadra nos filtros selecionados.'}
              </div>
            ) : (
              <div className="space-y-8">
                {(
                  [
                    {
                      key: 'celula' as const,
                      title: 'Célula',
                      hours: aeronave.horasTotais,
                      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
                      dotClass: 'bg-sky-400',
                    },
                    {
                      key: 'motor' as const,
                      title: 'Motor',
                      hours: aeronave.horasMotor || 0,
                      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                      dotClass: 'bg-emerald-400',
                    },
                    {
                      key: 'helice' as const,
                      title: 'Hélice',
                      hours: aeronave.horasHelice || 0,
                      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                      dotClass: 'bg-amber-400',
                    },
                  ]
                )
                  .filter((sec) => mapaSistemaFilter === 'todos' || mapaSistemaFilter === sec.key)
                  .map((sec) => {
                    const groupAlertas = alertasFiltrados.filter((al) => (al.sistema || 'celula') === sec.key);
                    if (groupAlertas.length === 0) return null;

                    return (
                      <div key={sec.key} className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${sec.dotClass}`} />
                            <h4 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                              {sec.title}
                            </h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sec.badgeClass}`}>
                              {groupAlertas.length} {groupAlertas.length === 1 ? 'item' : 'itens'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            Horas atuais ({sec.title}): <strong className="text-slate-200">{sec.hours.toFixed(1)} hs</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-5">
                          {groupAlertas.map((al) => {
                            const isInspecao = al.tipoItem === 'inspecao';
                            const compOriginal = !isInspecao ? componentes.find(c => c.id === al.idComponente) : undefined;
                            const inspOriginal = isInspecao ? inspecoes.find(i => i.id === al.idComponente) : undefined;
                            if (!compOriginal && !inspOriginal) return null;

                            const sistema = isInspecao ? inspOriginal!.sistema : compOriginal!.sistema;
                            const limiteHoras = isInspecao ? inspOriginal!.limiteHoras : compOriginal!.limiteHoras;
                            const limiteDias = isInspecao ? inspOriginal!.limiteDias : compOriginal!.limiteDias;
                            
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
                                key={`${al.tipoItem || 'comp'}-${al.idComponente}`}
                                className={`border rounded-2xl p-5 ${cardBorderClass} flex flex-col md:flex-row justify-between gap-5 transition-all`}
                                id={`alert-card-${al.idComponente}`}
                              >
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-start justify-between md:justify-start gap-3">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                        <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${bgAlertClass}`}>
                                          {statusLabel}
                                        </span>
                                        <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                                          isInspecao
                                            ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                            : 'bg-slate-800 text-slate-300 border-slate-700'
                                        }`}>
                                          {isInspecao ? 'Inspeção Periódica' : 'Componente'}
                                        </span>
                                        <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                                          sistema === 'motor'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : sistema === 'helice'
                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                        }`}>
                                          {sistema === 'celula' ? 'Célula' : sistema === 'motor' ? 'Motor' : 'Hélice'}
                                        </span>
                                      </div>
                                      <h4 className="font-display font-extrabold text-sm text-white tracking-tight leading-none">{al.nomeComponente}</h4>
                                      {isInspecao && inspOriginal ? (
                                        <div className="text-[10px] text-slate-400 mt-1.5 space-y-0.5">
                                          {inspOriginal.oficinaExecutante && (
                                            <p>Oficina: <strong className="text-emerald-400">{inspOriginal.oficinaExecutante}</strong></p>
                                          )}
                                          {inspOriginal.conteudo && (
                                            <p className="text-slate-300 line-clamp-2">{inspOriginal.conteudo}</p>
                                          )}
                                          {inspOriginal.observacao && (
                                            <p className="text-slate-400 italic line-clamp-1">Obs: {inspOriginal.observacao}</p>
                                          )}
                                        </div>
                                      ) : compOriginal ? (
                                        <p className="text-[10px] text-slate-400 mt-1.5">
                                          P/N: <strong className="text-slate-200">{compOriginal.partNumber || 'N/D'}</strong> • 
                                          S/N: <strong className="text-slate-200">{compOriginal.serialNumber || 'N/D'}</strong>
                                          {compOriginal.oficinaExecutante && (
                                            <> • Oficina: <strong className="text-emerald-400">{compOriginal.oficinaExecutante}</strong></>
                                          )}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>

                                  {/* Dados de referência */}
                                  <div className="grid grid-cols-2 gap-4 text-xs bg-slate-900/50 p-3.5 rounded-xl border border-slate-750/30">
                                    <div>
                                      <span className="text-slate-405 text-[10px] block font-semibold mb-1">
                                        {isInspecao ? 'Última Inspeção Realizada' : 'Última Revisão Realizada'}
                                      </span>
                                      <span className="font-semibold text-slate-200 mt-0.5 flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                        {formatDataBR(al.dataUltima)}
                                      </span>
                                      {isInspecao && inspOriginal ? (
                                        <div className="text-[10px] text-slate-505 italic mt-0.5 space-y-0.5 font-mono">
                                          <div>Célula: {(inspOriginal.horasCelulaNaInspecao || 0).toFixed(1)} hs</div>
                                          {inspOriginal.sistema === 'motor' && (
                                            <div className="text-emerald-400">Motor: {(inspOriginal.horasMotorNaInspecao || 0).toFixed(1)} hs</div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-slate-505 italic block mt-0.5">
                                          Com {al.horasUltima.toFixed(1)} hs voo ({sistema === 'celula' ? 'Célula' : sistema === 'motor' ? 'Motor' : 'Hélice'})
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-slate-405 text-[10px] block font-semibold mb-1">Vencimento Planejado</span>
                                      {limiteDias > 0 && al.dataVencimento && (
                                        <span className="font-semibold text-slate-200 mt-0.5 flex items-center gap-1.5">
                                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                          {formatDataBR(al.dataVencimento)}
                                        </span>
                                      )}
                                      {limiteHoras > 0 && (
                                        <div className="space-y-0.5 mt-1 font-mono">
                                          {sistema === 'celula' && al.horasLimiteCelula !== undefined && (
                                            <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                                              Célula: {al.horasLimiteCelula.toFixed(1)} hs
                                            </span>
                                          )}
                                          {sistema === 'motor' && (
                                            <>
                                              {al.horasLimiteCelula !== undefined && (
                                                <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                                                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                                                  Célula: {al.horasLimiteCelula.toFixed(1)} hs
                                                </span>
                                              )}
                                              {al.horasLimiteMotor !== undefined && (
                                                <span className="font-semibold text-emerald-400 flex items-center gap-1.5 text-[11px] pl-5">
                                                  Motor: {al.horasLimiteMotor.toFixed(1)} hs
                                                </span>
                                              )}
                                            </>
                                          )}
                                          {sistema === 'helice' && (
                                            <>
                                              {al.horasLimiteCelula !== undefined && (
                                                <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                                                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                                                  Célula: {al.horasLimiteCelula.toFixed(1)} hs
                                                </span>
                                              )}
                                              {al.horasLimiteHelice !== undefined && (
                                                <span className="font-semibold text-amber-400 flex items-center gap-1.5 text-[11px] pl-5">
                                                  Hélice: {al.horasLimiteHelice.toFixed(1)} hs
                                                </span>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Medidores de Margem */}
                                <div className="w-full md:w-80 flex flex-col justify-center space-y-4 border-t pt-4 md:border-t-0 md:pt-0 border-slate-800/60">
                                  
                                  {/* Margem de Horas */}
                                  {(al.metric === 'horas' || al.metric === 'ambas') && limiteHoras > 0 && (
                                    <div className="space-y-2">
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">Margem por Horas de Voo</span>
                                        
                                        {sistema === 'celula' && al.horasRestantesCelula !== undefined && (
                                          <div className="flex justify-between text-xs font-semibold">
                                            <span className="text-slate-350">Célula:</span>
                                            <span className={textAlertClass}>
                                              {al.horasRestantesCelula <= 0 ? 'Vencido!' : `${al.horasRestantesCelula.toFixed(1)} hs rest.`}
                                            </span>
                                          </div>
                                        )}
                                        
                                        {sistema === 'motor' && (
                                          <div className="space-y-1.5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/50">
                                            {al.horasRestantesCelula !== undefined && (
                                              <div className="flex justify-between text-xs font-semibold">
                                                <span className="text-slate-350">Célula:</span>
                                                <span className={textAlertClass}>
                                                  {al.horasRestantesCelula <= 0 ? 'Vencido!' : `${al.horasRestantesCelula.toFixed(1)} hs rest.`}
                                                </span>
                                              </div>
                                            )}
                                            {al.horasRestantesMotor !== undefined && (
                                              <div className="flex justify-between text-xs font-semibold border-t border-slate-900 pt-1.5">
                                                <span className="text-emerald-400">Motor:</span>
                                                <span className="text-emerald-400 font-mono font-bold">
                                                  {al.horasRestantesMotor <= 0 ? 'Vencido!' : `${al.horasRestantesMotor.toFixed(1)} hs rest.`}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {sistema === 'helice' && (
                                          <div className="space-y-1.5 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/50">
                                            {al.horasRestantesCelula !== undefined && (
                                              <div className="flex justify-between text-xs font-semibold">
                                                <span className="text-slate-350">Célula:</span>
                                                <span className={textAlertClass}>
                                                  {al.horasRestantesCelula <= 0 ? 'Vencido!' : `${al.horasRestantesCelula.toFixed(1)} hs rest.`}
                                                </span>
                                              </div>
                                            )}
                                            {al.horasRestantesHelice !== undefined && (
                                              <div className="flex justify-between text-xs font-semibold border-t border-slate-900 pt-1.5">
                                                <span className="text-amber-400">Hélice:</span>
                                                <span className="text-amber-400 font-mono font-bold">
                                                  {al.horasRestantesHelice <= 0 ? 'Vencido!' : `${al.horasRestantesHelice.toFixed(1)} hs rest.`}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Barra de Progresso */}
                                      <div className="w-full bg-slate-950/80 rounded-full h-2 overflow-hidden border border-slate-800/80">
                                        <div
                                          className={`h-full rounded-full ${al.status === 'critico' ? 'bg-red-500' : al.status === 'atencao' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                          style={{ width: `${Math.max(0, Math.min(100, (al.horasRestantes / limiteHoras) * 100))}%` }}
                                        ></div>
                                      </div>
                                      <div className="flex justify-between text-[9px] text-slate-500 font-medium font-mono">
                                        <span>
                                          {isInspecao && inspOriginal
                                            ? `Realizada: ${inspOriginal.sistema === 'motor' ? inspOriginal.horasMotorNaInspecao || 0 : inspOriginal.horasCelulaNaInspecao || 0} hs (${inspOriginal.sistema === 'motor' ? 'Motor' : 'Célula'})`
                                            : `Instalado: ${compOriginal?.horasInstalacao || 0} hs (${sistema === 'celula' ? 'Célula' : sistema === 'motor' ? 'Motor' : 'Hélice'})`}
                                        </span>
                                        <span>Intervalo: {limiteHoras} hs</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Margem de Dias */}
                                  {(al.metric === 'dias' || al.metric === 'ambas') && limiteDias > 0 && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-400 text-[10px] uppercase font-bold">Margem Calendária (Dias)</span>
                                        <span className={textAlertClass}>
                                          {al.diasRestantes <= 0 ? 'Vencido!' : `${al.diasRestantes} dias restantes`}
                                        </span>
                                      </div>
                                      
                                      {/* Barra de Progresso */}
                                      <div className="w-full bg-slate-950/80 rounded-full h-2 overflow-hidden border border-slate-800/80">
                                        <div
                                          className={`h-full rounded-full ${al.status === 'critico' ? 'bg-red-500' : al.status === 'atencao' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                          style={{ width: `${Math.max(0, Math.min(100, (al.diasRestantes / limiteDias) * 100))}%` }}
                                        ></div>
                                      </div>
                                      <div className="flex justify-between text-[9px] text-slate-500 font-medium font-mono">
                                        <span>Prazo: {limiteDias} dias</span>
                                        <span>Vencimento: {formatDataBR(al.dataVencimento)}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Botão Ação Rápida */}
                                  <div className="pt-2 text-right">
                                    {isInspecao && inspOriginal ? (
                                      <button
                                        onClick={() => {
                                          handleEditInspecao(inspOriginal);
                                          setActiveTab('inspecoes');
                                        }}
                                        className="inline-flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-bold py-1.5 px-3 rounded-xl border border-indigo-500/25 transition-all cursor-pointer"
                                      >
                                        <ClipboardCheck className="w-3.5 h-3.5" />
                                        {userRole === 'oficina' ? 'Visualizar Inspeção' : 'Abrir / Atualizar Inspeção'}
                                      </button>
                                    ) : compOriginal ? (
                                      <button
                                        onClick={() => openRevisaoForComponente(compOriginal)}
                                        className="inline-flex items-center gap-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-bold py-1.5 px-3 rounded-xl border border-sky-500/25 transition-all cursor-pointer"
                                      >
                                        <Wrench className="w-3.5 h-3.5" />
                                        Iniciar Revisão / Laudo
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'componentes' && (
          isCompFormOpen ? (() => {
            const isCompReadOnly = userRole === 'oficina';
            return (
            <div className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl p-6 sm:p-8 space-y-6 w-full max-w-3xl mx-auto animate-fade-in">
              <div className="flex justify-between items-center pb-4 border-b border-slate-850">
                <div>
                  <h3 className="text-base font-display font-bold text-white tracking-tight flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-sky-400" />
                    {isCompReadOnly ? 'Detalhes do Componente' : compEditing ? 'Editar Componente' : 'Cadastrar Componente Controlado'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isCompReadOnly ? 'Visualize os dados do componente e baixe os documentos anexados.' : 'Preencha os dados do componente e seus limites de rastreamento.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsCompFormOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-800"
                >
                  ✕ Voltar
                </button>
              </div>

              <form onSubmit={handleSaveComponente} className="space-y-6">
                <fieldset disabled={isCompReadOnly} className="space-y-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome do Componente ou Peça *</label>
                    <input
                      type="text"
                      required
                      value={compNome}
                      onChange={(e) => setCompNome(e.target.value)}
                      placeholder="Ex: Magneto do Motor Esquerdo, Turbocompressor"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-medium placeholder-slate-600 transition-colors"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Este componente está associado a:</label>
                    <div className="grid grid-cols-3 gap-3">
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        compSistema === 'celula' 
                          ? 'bg-sky-500/10 border-sky-500/50 text-white shadow-md shadow-sky-500/5' 
                          : 'bg-slate-1000 border-slate-750 text-slate-400 hover:border-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name="sistema"
                          value="celula"
                          checked={compSistema === 'celula'}
                          onChange={() => setCompSistema('celula')}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${compSistema === 'celula' ? 'border-sky-500' : 'border-slate-600'}`}>
                          {compSistema === 'celula' && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                        </div>
                        <span className="text-xs font-semibold">Célula</span>
                      </label>

                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        compSistema === 'motor' 
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-md shadow-emerald-500/5' 
                          : 'bg-slate-1000 border-slate-750 text-slate-400 hover:border-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name="sistema"
                          value="motor"
                          checked={compSistema === 'motor'}
                          onChange={() => setCompSistema('motor')}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${compSistema === 'motor' ? 'border-emerald-500' : 'border-slate-600'}`}>
                          {compSistema === 'motor' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </div>
                        <span className="text-xs font-semibold">Motor</span>
                      </label>

                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        compSistema === 'helice' 
                          ? 'bg-amber-500/10 border-amber-500/50 text-white shadow-md shadow-amber-500/5' 
                          : 'bg-slate-1000 border-slate-750 text-slate-400 hover:border-slate-700'
                      }`}>
                        <input
                          type="radio"
                          name="sistema"
                          value="helice"
                          checked={compSistema === 'helice'}
                          onChange={() => setCompSistema('helice')}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${compSistema === 'helice' ? 'border-amber-500' : 'border-slate-600'}`}>
                          {compSistema === 'helice' && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                        </div>
                        <span className="text-xs font-semibold">Hélice</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Marca / Fabricante</label>
                    <input
                      type="text"
                      value={compMarca}
                      onChange={(e) => setCompMarca(e.target.value)}
                      placeholder="Ex: Lycoming, Champion"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Oficina Executante</label>
                    <input
                      type="text"
                      value={compOficinaExecutante}
                      onChange={(e) => setCompOficinaExecutante(e.target.value)}
                      placeholder="Ex: Oficina Aero Sol, Hangar 12"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Part Number (P/N)</label>
                    <input
                      type="text"
                      value={compPartNumber}
                      onChange={(e) => setCompPartNumber(e.target.value)}
                      placeholder="Ex: PN-90234"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Serial Number (S/N)</label>
                    <input
                      type="text"
                      value={compSerialNumber}
                      onChange={(e) => setCompSerialNumber(e.target.value)}
                      placeholder="Ex: SN-54231-G"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400">Condição de Entrada do Componente *</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setCompCondicao('novo');
                        setCompUltimaRevisaoHoras(0);
                        setCompUltimaRevisaoData(compDataInstalacao);
                      }}
                      className={`flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        compCondicao === 'novo'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/5'
                          : 'bg-slate-1000 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full border-2 ${compCondicao === 'novo' ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'}`}></span>
                      Novo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCompCondicao('overhaul');
                        if (!compEditing && compUltimaRevisaoHoras === 0) {
                          setCompUltimaRevisaoHoras(compHorasInstalacao);
                        }
                      }}
                      className={`flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        compCondicao === 'overhaul'
                          ? 'bg-purple-500/10 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/5'
                          : 'bg-slate-1000 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full border-2 ${compCondicao === 'overhaul' ? 'border-purple-400 bg-purple-400' : 'border-slate-600'}`}></span>
                      Overhauled
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950/50 p-5 rounded-xl space-y-4 border border-slate-800">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-sky-400 font-mono">Parâmetros de Limites e Vencimentos</p>

                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Limite por Horas Voadas</label>
                      <input
                        type="number"
                        value={compLimiteHoras}
                        onChange={(e) => setCompLimiteHoras(Number(e.target.value))}
                        min={0}
                        className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono transition-colors"
                      />
                      <span className="text-[9px] text-slate-500 italic mt-1.5 block leading-normal">Zere se não for controlado por horas</span>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Limite por Dias Calendário</label>
                      <input
                        type="number"
                        value={compLimiteDias}
                        onChange={(e) => setCompLimiteDias(Number(e.target.value))}
                        min={0}
                        className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono transition-colors"
                      />
                      <span className="text-[9px] text-slate-500 italic mt-1.5 block leading-normal">Zere se não houver validade temporal</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data da Instalação *</label>
                    <input
                      type="date"
                      required
                      value={compDataInstalacao}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompDataInstalacao(val);
                        if (compCondicao === 'novo') {
                          setCompUltimaRevisaoData(val);
                        }
                      }}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Horas Totais da Célula na Instalação *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={compHorasInstalacao}
                      onChange={(e) => setCompHorasInstalacao(Number(e.target.value))}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono transition-colors"
                    />
                  </div>
                </div>

                {compSistema === 'motor' && (
                  <div>
                    <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                      Horas Totais do Motor na Instalação *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={compHorasInstalacaoMotor}
                      onChange={(e) => setCompHorasInstalacaoMotor(Number(e.target.value))}
                      className="w-full bg-slate-1000 border border-emerald-500/55 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-slate-100 font-mono transition-colors"
                    />
                  </div>
                )}

                {compSistema === 'helice' && (
                  <div>
                    <label className="block text-xs font-semibold text-amber-400 mb-1.5">
                      Horas Totais da Hélice na Instalação *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={compHorasInstalacaoHelice}
                      onChange={(e) => setCompHorasInstalacaoHelice(Number(e.target.value))}
                      className="w-full bg-slate-1000 border border-amber-500/55 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 text-slate-100 font-mono transition-colors"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Data Última Revisão * {compCondicao === 'novo' && <span className="text-[10px] text-emerald-400 italic">(Igual à Instalação para Novo)</span>}
                    </label>
                    <input
                      type="date"
                      required
                      disabled={compCondicao === 'novo'}
                      value={compUltimaRevisaoData}
                      onChange={(e) => setCompUltimaRevisaoData(e.target.value)}
                      className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none text-slate-100 transition-colors ${
                        compCondicao === 'novo'
                          ? 'bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                          : 'bg-slate-1000 border-slate-700 focus:border-sky-500'
                      }`}
                    />
                  </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                       Horas Totais do Componente * {compCondicao === 'novo' && <span className="text-[10px] text-emerald-400 italic">(0 horas para Novo)</span>}
                     </label>
                     <input
                       type="number"
                       step="0.1"
                       required
                       disabled={compCondicao === 'novo'}
                       value={compUltimaRevisaoHoras}
                       onChange={(e) => setCompUltimaRevisaoHoras(Number(e.target.value))}
                       className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none text-slate-100 font-mono transition-colors ${
                         compCondicao === 'novo'
                           ? 'bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                           : 'bg-slate-1000 border-slate-700 focus:border-sky-500'
                       }`}
                     />
                   </div>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-400">
                    {isCompReadOnly
                      ? 'Documentos, Fichas Técnicas ou Notas Fiscais Anexados'
                      : 'Anexar Documentos, Fichas Técnicas ou Notas Fiscais (PDF ou Imagem)'}
                  </label>
                  {!isCompReadOnly && (
                    <div className="border border-dashed border-slate-700 rounded-xl p-5 bg-slate-950/20 text-center relative hover:bg-slate-950/40 transition-colors">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,image/*"
                        onChange={handleCompFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <div className="space-y-1">
                        <Upload className="w-6 h-6 text-slate-500 mx-auto" />
                        <p className="text-xs text-slate-300">
                          {compAttachments.length > 0
                            ? `Clique ou arraste para adicionar mais arquivos (${compAttachments.length} ${compAttachments.length === 1 ? 'anexado' : 'anexados'})`
                            : 'Clique ou arraste um ou mais arquivos aqui para fazer o upload'}
                        </p>
                        <p className="text-[10px] text-slate-500">Você pode selecionar vários arquivos. Tamanho máximo recomendado: 15MB por arquivo</p>
                      </div>
                    </div>
                  )}

                  {compAttachments.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {compAttachments.map((anexo, index) => (
                        <div
                          key={`${anexo.nome}-${index}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                            <span className="text-slate-200 truncate">{anexo.nome}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a
                              href={anexo.dados}
                              download={anexo.nome}
                              className="p-1 text-slate-400 hover:text-sky-400 rounded-md hover:bg-slate-800 transition-colors"
                              title="Baixar arquivo"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            {!isCompReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCompAttachment(index)}
                                className="p-1 text-slate-400 hover:text-red-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Remover anexo"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : isCompReadOnly ? (
                    <p className="text-xs text-slate-500 italic py-2">Nenhum documento anexado a este componente.</p>
                  ) : null}
                </div>
                </fieldset>

                <div className="pt-5 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCompFormOpen(false)}
                    className="px-5 py-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    {isCompReadOnly ? 'Fechar' : 'Cancelar'}
                  </button>
                  {!isCompReadOnly && (
                    <button
                      type="submit"
                      className="px-6 py-3 text-xs font-bold text-white bg-sky-500 hover:bg-sky-650 rounded-xl transition-colors cursor-pointer shadow-lg shadow-sky-500/10"
                    >
                      {compEditing ? 'Salvar Edição' : 'Cadastrar Componente'}
                    </button>
                  )}
                </div>
              </form>
            </div>
            );
          })() : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-display font-bold text-white tracking-tight">Componentes e Peças Controladas</h3>
                  <p className="text-xs text-slate-400">Cadastre as peças que possuem desgaste por horas de voo ou tempo limite.</p>
                </div>
                {userRole !== 'oficina' && (
                  <button
                    onClick={openNovoComponente}
                    className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-sky-500/10 w-fit"
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar Componente
                  </button>
                )}
              </div>

              {componentes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-slate-900/40 p-2 rounded-xl border border-slate-800/70 w-fit">
                  {(
                    [
                      { id: 'todos', label: 'Todos', count: componentes.length, activeClass: 'bg-slate-700 text-white border-slate-500' },
                      { id: 'celula', label: 'Célula', count: componentes.filter(c => (c.sistema || 'celula') === 'celula').length, activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
                      { id: 'motor', label: 'Motor', count: componentes.filter(c => c.sistema === 'motor').length, activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
                      { id: 'helice', label: 'Hélice', count: componentes.filter(c => c.sistema === 'helice').length, activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCompSistemaFilter(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        compSistemaFilter === opt.id
                          ? opt.activeClass
                          : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[10px] font-mono opacity-80">({opt.count})</span>
                    </button>
                  ))}
                </div>
              )}

              {componentes.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-8 text-slate-400 text-xs font-mono">
                  Nenhum componente mapeado nesta aeronave. Inicie o rastreamento clicando no botão acima!
                </div>
              ) : (() => {
                const compGroups = (
                  [
                    {
                      key: 'celula' as const,
                      title: 'Célula',
                      hours: aeronave.horasTotais,
                      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
                      dotClass: 'bg-sky-400',
                    },
                    {
                      key: 'motor' as const,
                      title: 'Motor',
                      hours: aeronave.horasMotor || 0,
                      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                      dotClass: 'bg-emerald-400',
                    },
                    {
                      key: 'helice' as const,
                      title: 'Hélice',
                      hours: aeronave.horasHelice || 0,
                      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                      dotClass: 'bg-amber-400',
                    },
                  ]
                )
                  .filter((sec) => compSistemaFilter === 'todos' || compSistemaFilter === sec.key)
                  .map((sec) => ({
                    ...sec,
                    items: componentes.filter((c) => (c.sistema || 'celula') === sec.key),
                  }))
                  .filter((sec) => sec.items.length > 0);

                if (compGroups.length === 0) {
                  return (
                    <div className="text-center py-12 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-6 text-slate-400 text-xs font-mono">
                      Nenhum componente cadastrado para o sistema selecionado.
                    </div>
                  );
                }

                return (
                  <div className="space-y-8">
                    {compGroups.map((sec) => (
                      <div key={sec.key} className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${sec.dotClass}`} />
                            <h4 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                              {sec.title}
                            </h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sec.badgeClass}`}>
                              {sec.items.length} {sec.items.length === 1 ? 'componente' : 'componentes'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            Horas atuais ({sec.title}): <strong className="text-slate-200">{sec.hours.toFixed(1)} hs</strong>
                          </span>
                        </div>

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
                              {sec.items.map((c) => {
                                const alerta = calcularAlerta(c, aeronave);
                                return (
                                  <tr key={c.id} className="hover:bg-slate-850/40 transition-colors" id={`comp-row-${c.id}`}>
                                    <td className="p-4 font-semibold text-white">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 animate-pulse ${
                                          alerta.status === 'critico' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : alerta.status === 'atencao' ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                                        }`} title={`Status: ${alerta.status}`}></span>
                                        <button
                                          type="button"
                                          onClick={() => handleEditComponente(c)}
                                          className="text-left hover:text-sky-400 transition-colors cursor-pointer"
                                          title="Abrir componente e anexos"
                                        >
                                          {c.nome}
                                        </button>
                                        {c.condicao && (
                                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-extrabold uppercase tracking-widest ${
                                            c.condicao === 'novo'
                                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                          }`}>
                                            {c.condicao === 'novo' ? 'Novo' : 'Overhauled'}
                                          </span>
                                        )}
                                        {c.sistema && (
                                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-extrabold uppercase tracking-widest ${
                                            c.sistema === 'motor'
                                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                              : c.sistema === 'helice'
                                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                              : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                          }`}>
                                            {c.sistema === 'celula' ? 'Célula' : c.sistema === 'motor' ? 'Motor' : 'Hélice'}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="space-y-1">
                                        {c.marca && (
                                          <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                                            {c.marca}
                                          </div>
                                        )}
                                        <div className="space-y-0.5 font-mono text-[11px] text-slate-400">
                                          <div>P/N: <strong className="text-slate-200">{c.partNumber || '-'}</strong></div>
                                          <div>S/N: <strong className="text-slate-200">{c.serialNumber || '-'}</strong></div>
                                          {c.oficinaExecutante && (
                                            <div className="text-[10px] text-emerald-400 font-sans mt-1">
                                              Oficina: <strong className="font-semibold text-slate-200">{c.oficinaExecutante}</strong>
                                            </div>
                                          )}
                                        </div>
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
                                        <div className="space-y-0.5 text-[10px] font-mono text-slate-500">
                                          <div>Célula: <strong className="text-slate-300">{c.horasInstalacao || 0} hs</strong></div>
                                          {c.sistema === 'motor' && (
                                            <div>Motor: <strong className="text-emerald-400">{c.horasInstalacaoMotor || 0} hs</strong></div>
                                          )}
                                          {c.sistema === 'helice' && (
                                            <div>Hélice: <strong className="text-amber-400">{c.horasInstalacaoHelice || 0} hs</strong></div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="space-y-0.5 text-slate-300">
                                        <div>{formatDataBR(c.ultimaRevisaoData || c.dataInstalacao)}</div>
                                        <div className="text-slate-500 text-[10px] font-mono">Aos {c.horasInstalacao} hs voo</div>
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
                                        {userRole === 'oficina' ? (
                                          <button
                                            onClick={() => handleEditComponente(c)}
                                            className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition-colors"
                                            title="Visualizar Componente e Anexos"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                          </button>
                                        ) : (
                                          <>
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
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )
        )}

        {/* --- TAB: INSPEÇÕES PERIÓDICAS --- */}
        {!loading && activeTab === 'inspecoes' && (
          isInspFormOpen ? (() => {
            const isInspReadOnly = userRole === 'oficina';
            return (
              <div className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl p-6 sm:p-8 space-y-6 w-full max-w-3xl mx-auto animate-fade-in">
                <div className="flex justify-between items-center pb-4 border-b border-slate-850">
                  <div>
                    <h3 className="text-base font-display font-bold text-white tracking-tight flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5 text-sky-400" />
                      {isInspReadOnly ? 'Detalhes da Inspeção Periódica' : inspEditing ? 'Editar Inspeção Periódica' : 'Cadastrar Inspeção Periódica'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isInspReadOnly
                        ? 'Visualize os detalhes, horas registradas e prazos da inspeção.'
                        : 'Configure a inspeção periódica associada à célula ou ao motor e seus limites de controle.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsInspFormOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-800"
                  >
                    ✕ Voltar
                  </button>
                </div>

                <form onSubmit={handleSaveInspecao} className="space-y-6">
                  <fieldset disabled={isInspReadOnly} className="space-y-6">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome da Inspeção *</label>
                        <input
                          type="text"
                          required
                          value={inspNome}
                          onChange={(e) => setInspNome(e.target.value)}
                          placeholder="Ex: Inspeção de 50 Horas, Inspeção de 100 Horas, IAM / CVA"
                          className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-medium placeholder-slate-600 transition-colors"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Esta inspeção está associada a: *</label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                            inspSistema === 'celula'
                              ? 'bg-sky-500/10 border-sky-500/50 text-white shadow-md shadow-sky-500/5'
                              : 'bg-slate-1000 border-slate-750 text-slate-400 hover:border-slate-700'
                          }`}>
                            <input
                              type="radio"
                              name="inspSistema"
                              value="celula"
                              checked={inspSistema === 'celula'}
                              onChange={() => setInspSistema('celula')}
                              className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${inspSistema === 'celula' ? 'border-sky-500' : 'border-slate-600'}`}>
                              {inspSistema === 'celula' && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                            </div>
                            <span className="text-xs font-semibold">Célula</span>
                          </label>

                          <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                            inspSistema === 'motor'
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-md shadow-emerald-500/5'
                              : 'bg-slate-1000 border-slate-750 text-slate-400 hover:border-slate-700'
                          }`}>
                            <input
                              type="radio"
                              name="inspSistema"
                              value="motor"
                              checked={inspSistema === 'motor'}
                              onChange={() => setInspSistema('motor')}
                              className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${inspSistema === 'motor' ? 'border-emerald-500' : 'border-slate-600'}`}>
                              {inspSistema === 'motor' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                            </div>
                            <span className="text-xs font-semibold">Motor</span>
                          </label>
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Conteúdo da Inspeção *</label>
                        <textarea
                          required
                          rows={3}
                          value={inspConteudo}
                          onChange={(e) => setInspConteudo(e.target.value)}
                          placeholder="Descreva os itens verificados, serviços e procedimentos desta inspeção..."
                          className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors resize-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Observação</label>
                        <textarea
                          rows={2}
                          value={inspObservacao}
                          onChange={(e) => setInspObservacao(e.target.value)}
                          placeholder="Observações adicionais, recomendações ou pendências..."
                          className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors resize-none"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-950/50 p-5 rounded-xl space-y-4 border border-slate-800">
                      <p className="text-[10px] uppercase font-bold tracking-widest text-sky-400 font-mono">Parâmetros de Limites e Vencimentos</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Limite por Horas</label>
                          <input
                            type="number"
                            value={inspLimiteHoras}
                            onChange={(e) => setInspLimiteHoras(Number(e.target.value))}
                            min={0}
                            className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono transition-colors"
                          />
                          <span className="text-[9px] text-slate-500 italic mt-1.5 block leading-normal">Zere se não for controlada por horas</span>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Limite por Dias</label>
                          <input
                            type="number"
                            value={inspLimiteDias}
                            onChange={(e) => setInspLimiteDias(Number(e.target.value))}
                            min={0}
                            className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono transition-colors"
                          />
                          <span className="text-[9px] text-slate-500 italic mt-1.5 block leading-normal">Zere se não houver validade temporal</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data em que foi feita *</label>
                        <input
                          type="date"
                          required
                          value={inspDataRealizacao}
                          onChange={(e) => setInspDataRealizacao(e.target.value)}
                          className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Oficina que fez</label>
                        <input
                          type="text"
                          value={inspOficinaExecutante}
                          onChange={(e) => setInspOficinaExecutante(e.target.value)}
                          placeholder="Ex: Oficina Aero Sol, Hangar 12"
                          className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-600 transition-colors"
                        />
                      </div>
                    </div>

                    <div className={`grid grid-cols-1 ${inspSistema === 'motor' ? 'sm:grid-cols-2' : ''} gap-5`}>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                          Horas Totais de Célula na Inspeção *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={inspHorasCelula}
                          onChange={(e) => setInspHorasCelula(Number(e.target.value))}
                          className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono transition-colors"
                        />
                      </div>

                      {inspSistema === 'motor' && (
                        <div>
                          <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                            Horas Totais de Motor na Inspeção *
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            required
                            value={inspHorasMotor}
                            onChange={(e) => setInspHorasMotor(Number(e.target.value))}
                            className="w-full bg-slate-1000 border border-emerald-500/55 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-slate-100 font-mono transition-colors"
                          />
                        </div>
                      )}
                    </div>
                  </fieldset>

                  <div className="pt-5 border-t border-slate-800 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsInspFormOpen(false)}
                      className="px-5 py-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                    >
                      {isInspReadOnly ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!isInspReadOnly && (
                      <button
                        type="submit"
                        className="px-6 py-3 text-xs font-bold text-white bg-sky-500 hover:bg-sky-650 rounded-xl transition-colors cursor-pointer shadow-lg shadow-sky-500/10"
                      >
                        {inspEditing ? 'Salvar Edição' : 'Cadastrar Inspeção'}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            );
          })() : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-display font-bold text-white tracking-tight">Inspeções Periódicas</h3>
                  <p className="text-xs text-slate-400">Cadastre as inspeções periódicas de célula e motor para controle automático no mapa de alertas.</p>
                </div>
                {userRole !== 'oficina' && (
                  <button
                    onClick={openNovaInspecao}
                    className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-sky-500/10 w-fit"
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar Inspeção
                  </button>
                )}
              </div>

              {inspecoes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-slate-900/40 p-2 rounded-xl border border-slate-800/70 w-fit">
                  {(
                    [
                      { id: 'todos', label: 'Todos', count: inspecoes.length, activeClass: 'bg-slate-700 text-white border-slate-500' },
                      { id: 'celula', label: 'Célula', count: inspecoes.filter(i => (i.sistema || 'celula') === 'celula').length, activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
                      { id: 'motor', label: 'Motor', count: inspecoes.filter(i => i.sistema === 'motor').length, activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setInspSistemaFilter(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        inspSistemaFilter === opt.id
                          ? opt.activeClass
                          : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[10px] font-mono opacity-80">({opt.count})</span>
                    </button>
                  ))}
                </div>
              )}

              {inspecoes.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-8 text-slate-400 text-xs font-mono">
                  Nenhuma inspeção periódica cadastrada nesta aeronave. Clique no botão acima para adicionar!
                </div>
              ) : (() => {
                const inspGroups = (
                  [
                    {
                      key: 'celula' as const,
                      title: 'Célula',
                      hours: aeronave.horasTotais,
                      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
                      dotClass: 'bg-sky-400',
                    },
                    {
                      key: 'motor' as const,
                      title: 'Motor',
                      hours: aeronave.horasMotor || 0,
                      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                      dotClass: 'bg-emerald-400',
                    },
                  ]
                )
                  .filter((sec) => inspSistemaFilter === 'todos' || inspSistemaFilter === sec.key)
                  .map((sec) => ({
                    ...sec,
                    items: inspecoes.filter((i) => (i.sistema || 'celula') === sec.key),
                  }))
                  .filter((sec) => sec.items.length > 0);

                if (inspGroups.length === 0) {
                  return (
                    <div className="text-center py-12 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-6 text-slate-400 text-xs font-mono">
                      Nenhuma inspeção periódica cadastrada para o sistema selecionado.
                    </div>
                  );
                }

                return (
                  <div className="space-y-8">
                    {inspGroups.map((sec) => (
                      <div key={sec.key} className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${sec.dotClass}`} />
                            <h4 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                              {sec.title}
                            </h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sec.badgeClass}`}>
                              {sec.items.length} {sec.items.length === 1 ? 'inspeção' : 'inspeções'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            Horas atuais ({sec.title}): <strong className="text-slate-200">{sec.hours.toFixed(1)} hs</strong>
                          </span>
                        </div>

                        <div className="overflow-x-auto border border-slate-700/50 rounded-2xl bg-slate-900/30">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-800/45 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-705/35">
                                <th className="p-4">Inspeção</th>
                                <th className="p-4">Conteúdo / Observação</th>
                                <th className="p-4">Limites Fixados</th>
                                <th className="p-4">Última Realização</th>
                                <th className="p-4 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-slate-300">
                              {sec.items.map((insp) => {
                                const alerta = calcularAlertaInspecao(insp, aeronave);
                                return (
                                  <tr key={insp.id} className="hover:bg-slate-850/40 transition-colors" id={`insp-row-${insp.id}`}>
                                    <td className="p-4 font-semibold text-white">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 animate-pulse ${
                                          alerta.status === 'critico' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : alerta.status === 'atencao' ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                                        }`} title={`Status: ${alerta.status}`}></span>
                                        <button
                                          type="button"
                                          onClick={() => handleEditInspecao(insp)}
                                          className="text-left hover:text-sky-400 transition-colors cursor-pointer"
                                          title="Abrir detalhes da inspeção"
                                        >
                                          {insp.nome}
                                        </button>
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-extrabold uppercase tracking-widest ${
                                          insp.sistema === 'motor'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                        }`}>
                                          {insp.sistema === 'motor' ? 'Motor' : 'Célula'}
                                        </span>
                                      </div>
                                      {insp.oficinaExecutante && (
                                        <div className="text-[10px] text-emerald-400 font-normal mt-1 pl-4">
                                          Oficina: <strong className="font-semibold text-slate-200">{insp.oficinaExecutante}</strong>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-4 max-w-xs">
                                      <div className="space-y-1">
                                        <p className="text-slate-200 line-clamp-2">{insp.conteudo || '-'}</p>
                                        {insp.observacao && (
                                          <p className="text-[10px] text-slate-400 italic line-clamp-1">Obs: {insp.observacao}</p>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-4 font-semibold text-slate-200">
                                      <div className="space-y-0.5">
                                        {insp.limiteHoras > 0 && <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-sky-400" /> {insp.limiteHoras} hs voo</div>}
                                        {insp.limiteDias > 0 && <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-sky-400" /> {insp.limiteDias} dias can.</div>}
                                        {insp.limiteHoras === 0 && insp.limiteDias === 0 && <span className="text-slate-500 italic font-medium">Livre / Não param.</span>}
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="space-y-0.5 text-slate-300">
                                        <div>{formatDataBR(insp.dataRealizacao)}</div>
                                        <div className="space-y-0.5 text-[10px] font-mono text-slate-500">
                                          <div>Célula: <strong className="text-slate-300">{insp.horasCelulaNaInspecao || 0} hs</strong></div>
                                          {insp.sistema === 'motor' && (
                                            <div>Motor: <strong className="text-emerald-400">{insp.horasMotorNaInspecao || 0} hs</strong></div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-4 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        {userRole === 'oficina' ? (
                                          <button
                                            onClick={() => handleEditInspecao(insp)}
                                            className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition-colors"
                                            title="Visualizar Inspeção"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                          </button>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => handleEditInspecao(insp)}
                                              className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition-colors"
                                              title="Editar"
                                            >
                                              <History className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteInspecao(insp.id)}
                                              className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )
        )}

        {/* --- TAB 3: DIÁRIO DE VOO (HISTÓRICO) --- */}
        {!loading && activeTab === 'voos' && (
          isVooFormOpen ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl p-6 sm:p-8 space-y-6 w-full max-w-3xl mx-auto animate-fade-in">
              <div className="flex justify-between items-center pb-4 border-b border-slate-850">
                <div>
                  <h3 className="text-base font-display font-bold text-white tracking-tight flex items-center gap-2">
                    <Activity className="w-5 h-5 text-sky-400" />
                    Registrar Novo Voo no Diário de Bordo
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Adicione os dados da etapa do voo. A duração decimal é calculada automaticamente entre Partida e Corte.</p>
                </div>
                <button
                  onClick={() => setIsVooFormOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-800"
                >
                  ✕ Voltar
                </button>
              </div>

              {vooFormError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-medium">
                  {vooFormError}
                </div>
              )}

              <form onSubmit={handleAddVoo} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data do Voo *</label>
                    <input
                      type="date"
                      required
                      value={vooData}
                      onChange={(e) => setVooData(e.target.value)}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">De (4 caracteres) *</label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      maxLength={4}
                      value={vooDe}
                      onChange={(e) => setVooDe(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
                      placeholder="Ex: SBSP"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono uppercase tracking-wider transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Para (4 caracteres) *</label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      maxLength={4}
                      value={vooPara}
                      onChange={(e) => setVooPara(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
                      placeholder="Ex: SBGL"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono uppercase tracking-wider transition-colors"
                    />
                  </div>
                </div>

                <div className="bg-slate-950/50 p-5 rounded-xl space-y-4 border border-slate-800">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-sky-400 font-mono">Horários da Etapa (HH:MM)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Partida *</label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={5}
                        pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                        value={vooPartida}
                        onChange={(e) => setVooPartida(formatTimeHHMM(e.target.value))}
                        placeholder="HH:MM"
                        className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono text-center transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Decolagem *</label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={5}
                        pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                        value={vooDecolagem}
                        onChange={(e) => setVooDecolagem(formatTimeHHMM(e.target.value))}
                        placeholder="HH:MM"
                        className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono text-center transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Pouso *</label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={5}
                        pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                        value={vooPouso}
                        onChange={(e) => setVooPouso(formatTimeHHMM(e.target.value))}
                        placeholder="HH:MM"
                        className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono text-center transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Corte *</label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={5}
                        pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                        value={vooCorte}
                        onChange={(e) => setVooCorte(formatTimeHHMM(e.target.value))}
                        placeholder="HH:MM"
                        className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono text-center transition-colors"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-semibold text-sky-400 mb-1.5">Duração (Hs Dec.)</label>
                      <input
                        type="text"
                        readOnly
                        value={vooHorasCalculado > 0 ? vooHorasCalculado.toFixed(2) : '0.00'}
                        className="w-full bg-slate-900 border border-sky-500/40 rounded-xl px-3.5 py-3 text-sm text-sky-400 font-extrabold font-mono text-center cursor-default"
                        title="Calculado automaticamente entre Partida e Corte em horas decimais"
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Duração de voo calculada automaticamente em horas decimais a partir dos campos Partida e Corte.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">PAX (Número)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={vooPax}
                      onChange={(e) => setVooPax(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 2"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">P/C (Número)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={vooPc}
                      onChange={(e) => setVooPc(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 1"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono transition-colors"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">CANAC (6 números) *</label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      minLength={6}
                      maxLength={6}
                      pattern="\d{6}"
                      value={vooCanac}
                      onChange={(e) => setVooCanac(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Ex: 123456"
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-mono tracking-wider transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Piloto em Comando (PIC) *</label>
                  <input
                    type="text"
                    required
                    value={vooPiloto}
                    onChange={(e) => setVooPiloto(e.target.value)}
                    placeholder="Ex: Cmte. Carlos Silva"
                    className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-605 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ocorrências</label>
                  <textarea
                    value={vooDescricao}
                    onChange={(e) => setVooDescricao(e.target.value)}
                    placeholder="Registre ocorrências do voo, discrepâncias ou observações..."
                    rows={4}
                    className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-605 transition-colors"
                  ></textarea>
                </div>

                <div className="pt-5 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsVooFormOpen(false)}
                    className="px-5 py-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition-colors cursor-pointer shadow-lg shadow-sky-500/10 active:scale-[0.98]"
                  >
                    Adicionar ao Diário
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-display font-bold text-white tracking-tight">Diário de Bordo / Histórico de Voos</h3>
                  <p className="text-xs text-slate-400">Registre os voos efetuados. As horas são automaticamente integradas ao contador geral para calcular os alertas de manutenção.</p>
                </div>
                {userRole !== 'oficina' && (
                  <button
                    onClick={openNovoVoo}
                    className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-sky-500/10"
                  >
                    <Plus className="w-4 h-4" />
                    Registrar Novo Voo
                  </button>
                )}
              </div>

              {vooListNotice && (
                <div
                  className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-xs border ${
                    vooListNotice.type === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/35 text-amber-200'
                      : 'bg-sky-950/45 border-sky-500/35 text-sky-200'
                  }`}
                >
                  <span>{vooListNotice.text}</span>
                  <button
                    type="button"
                    onClick={() => setVooListNotice(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                    aria-label="Fechar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {voos.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-700/60 bg-slate-900/10 rounded-2xl p-8 text-slate-400 text-xs font-mono">
                  Nenhum voo registrado no diário de bordo. Adicione registros para atualizar o tempo em serviço.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-700/50 rounded-2xl bg-slate-900/30">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800/45 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-705/35">
                        <th className="p-4">Data</th>
                        <th className="p-4">De / Para</th>
                        <th className="p-4">Part. / Dec. / Pouso / Corte</th>
                        <th className="p-4">PAX / P/C</th>
                        <th className="p-4">Piloto em Comando / CANAC</th>
                        <th className="p-4">Duração (Hs)</th>
                        <th className="p-4">Ocorrências</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {voos.map((v) => (
                        <tr
                          key={v.id}
                          className={`hover:bg-slate-850/40 transition-colors ${v.pendingSync ? 'bg-amber-950/15' : ''}`}
                          id={`voo-row-${v.id}`}
                        >
                          <td className="p-4 font-bold text-white whitespace-nowrap">
                            <div className="space-y-1">
                              <span className="flex items-center gap-2">
                                <Activity className={`w-4 h-4 ${v.pendingSync ? 'text-amber-400' : 'text-sky-400'}`} />
                                {formatDataBR(v.data)}
                              </span>
                              {v.pendingSync && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                                  <CloudUpload className="w-3 h-3" />
                                  Pendente Offline
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-200 whitespace-nowrap">
                            {v.de || v.para ? (
                              <span className="inline-flex items-center gap-1.5 bg-slate-800/70 px-2.5 py-1 rounded-lg border border-slate-700/50">
                                <span>{v.de || '----'}</span>
                                <span className="text-sky-400">→</span>
                                <span>{v.para || '----'}</span>
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                            {v.partida || v.decolagem || v.pouso || v.corte ? (
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                <span>Part: <strong className="text-slate-100">{v.partida || '--:--'}</strong></span>
                                <span>Dec: <strong className="text-slate-100">{v.decolagem || '--:--'}</strong></span>
                                <span>Pouso: <strong className="text-slate-100">{v.pouso || '--:--'}</strong></span>
                                <span>Corte: <strong className="text-slate-100">{v.corte || '--:--'}</strong></span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-4 font-mono text-[11px] whitespace-nowrap">
                            {v.pax !== undefined || v.pc !== undefined ? (
                              <div className="space-y-0.5">
                                <div>PAX: <strong className="text-slate-100">{v.pax ?? 0}</strong></div>
                                <div>P/C: <strong className="text-slate-100">{v.pc ?? 0}</strong></div>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-4">
                            <div className="space-y-0.5">
                              <span className="flex items-center gap-1.5 font-medium text-slate-200">
                                <User className="w-3.5 h-3.5 text-slate-500" />
                                <span>{v.piloto || 'N/D'}</span>
                              </span>
                              {v.canac && (
                                <div className="text-[10px] font-mono text-slate-400 pl-5">
                                  CANAC: <strong className="text-slate-200">{v.canac}</strong>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 font-black text-sky-400 text-[13px] font-mono whitespace-nowrap">
                            {v.horasVoo.toFixed(2)} hs
                          </td>
                          <td className="p-4 text-slate-400 font-medium italic max-w-xs">{v.descricao || '-'}</td>
                          <td className="p-4 text-right">
                            {userRole !== 'oficina' && (!isPilotOnly || v.pendingSync) && (
                              <button
                                onClick={() => void handleDeleteVoo(v.id, v.pendingSync)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                title={v.pendingSync ? 'Remover voo pendente da fila offline' : 'Excluir Diário'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}

        {!loading && activeTab === 'laudos' && (
          isRevFormOpen ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl p-6 sm:p-8 space-y-6 w-full max-w-3xl mx-auto animate-fade-in">
              <div className="flex justify-between items-center pb-4 border-b border-slate-850">
                <div>
                  <h3 className="text-base font-display font-bold text-white tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-sky-400" />
                    Registrar Nova Ficha de Revisão ou Laudo
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Registre o histórico de manutenção de um componente ou da célula geral e anexe laudos.</p>
                </div>
                <button
                  onClick={() => setIsRevFormOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-800"
                >
                  ✕ Voltar
                </button>
              </div>

              <form onSubmit={handleAddRevisao} className="space-y-6">
                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Componente Alvo</label>
                    <select
                      value={revComponenteId}
                      onChange={(e) => setRevComponenteId(e.target.value)}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 transition-colors text-slate-200"
                    >
                      <option value="" className="bg-slate-900">-- Aeronave Geral (Geral ou Célula) --</option>
                      {componentes.map(comp => (
                        <option key={comp.id} value={comp.id} className="bg-slate-900 text-slate-100">Peça: {comp.nome} (P/N: {comp.partNumber || 'ND'})</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Tipo de Manutenção *</label>
                    <select
                      required
                      value={revTipo}
                      onChange={(e) => setRevTipo(e.target.value as any)}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 transition-colors text-slate-200"
                    >
                      <option value="periodica" className="bg-slate-900">Periódica / Preventiva Requerida</option>
                      <option value="preventiva" className="bg-slate-900">Inspeção Preventiva Opcional</option>
                      <option value="corretiva" className="bg-slate-900">Manutenção Corretiva (Substituição de Peça)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data da Execução *</label>
                    <input
                      type="date"
                      required
                      value={revData}
                      onChange={(e) => setRevData(e.target.value)}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">H.V. da Aeronave na Revisão *</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={revHoras}
                      onChange={(e) => setRevHoras(Number(e.target.value))}
                      className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 font-bold font-mono transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Laudo Descritivo / Serviços Executados *</label>
                  <textarea
                    required
                    value={revDescricao}
                    onChange={(e) => setRevDescricao(e.target.value)}
                    placeholder="Descreva detalhadamente o serviço realizado. Ex: Efetuado abertura do magneto, limpeza de platinados, aferição e re-torque com troca da gaxeta de vedação..."
                    rows={4}
                    className="w-full bg-slate-1000 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-slate-100 placeholder-slate-605 transition-colors"
                  ></textarea>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Anexar Laudo Técnico ou Recibo de Peça (PDF ou Imagem)</label>
                  <div className="border border-dashed border-slate-700 rounded-xl p-5 bg-slate-950/20 text-center relative hover:bg-slate-950/40 transition-colors">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="space-y-1">
                      <Upload className="w-6 h-6 text-slate-500 mx-auto" />
                      <p className="text-xs text-slate-300">
                        {attachmentName ? (
                          <strong className="text-slate-100 flex items-center justify-center gap-1">
                            <Paperclip className="w-3.5 h-3.5 text-sky-400" />
                            {attachmentName} (Alterar)
                          </strong>
                        ) : (
                          'Clique ou arraste o arquivo aqui para fazer o upload'
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500">Tamanho máximo recomendado: 15MB</p>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRevFormOpen(false)}
                    className="px-5 py-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition-all cursor-pointer shadow-lg shadow-sky-500/10 active:scale-[0.98]"
                  >
                    Salvar laudo de Revisão
                  </button>
                </div>
              </form>
            </div>
          ) : (
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

                          {userRole !== 'oficina' && (
                            <button
                              onClick={() => handleDeleteRevisao(r.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors border-0"
                              title="Excluir Registro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

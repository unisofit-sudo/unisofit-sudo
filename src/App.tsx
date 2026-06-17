/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Cliente, Aeronave, DashboardStats } from './types';
import ClientesList from './components/ClientesList';
import AeronavesList from './components/AeronavesList';
import AeronaveDetail from './components/AeronaveDetail';
import { 
  Plane, 
  Users, 
  ShieldAlert, 
  Database, 
  Info, 
  Wrench, 
  Gauge, 
  ArrowLeft,
  Server
} from 'lucide-react';

export default function App() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [selectedAeronave, setSelectedAeronave] = useState<Aeronave | null>(null);
  
  const [dbStatus, setDbStatus] = useState({ connected: false, usingLocal: true });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- BUSCAR DADOS DO BACKEND ---
  const fetchBasics = async () => {
    setIsRefreshing(true);
    try {
      const [cliRes, aeroRes, healthRes] = await Promise.all([
        fetch('/api/clientes'),
        fetch('/api/aeronaves'),
        fetch('/api/health')
      ]);

      if (cliRes.ok) {
        setClientes(await cliRes.json());
      }
      if (aeroRes.ok) {
        const aeroList = await aeroRes.json();
        setAeronaves(aeroList);
      }
      if (healthRes.ok) {
        const data = await healthRes.json();
        // O status nos indica se o backend está ativo e respondendo
        setDbStatus({ connected: true, usingLocal: true });
      }
    } catch (e) {
      console.error('Falha ao sincronizar dados com o servidor local:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBasics();
  }, []);

  // Recarrega informações de uma aeronave específica da lista
  const handleRefreshAeronave = async () => {
    if (!selectedAeronave) return;
    try {
      const res = await fetch(`/api/aeronaves/${selectedAeronave.id}`);
      if (res.ok) {
        const updatedAero: Aeronave = await res.json();
        
        // Atualiza na lista local de aeronaves
        setAeronaves(prev => prev.map(a => a.id === updatedAero.id ? updatedAero : a));
        // Atualiza o contexto do selecionador
        setSelectedAeronave(updatedAero);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Contabiliza aeronaves por cliente
  const aeronavesCountMap = aeronaves.reduce<Record<string, number>>((acc, aero) => {
    acc[aero.clienteId] = (acc[aero.clienteId] || 0) + 1;
    return acc;
  }, {});

  // --- OPERAÇÕES CLIENTE ---
  const handleAddCliente = async (noIdCliente: Omit<Cliente, 'id'>) => {
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noIdCliente)
      });
      if (res.ok) {
        fetchBasics();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCliente = async (cliente: Cliente) => {
    try {
      const res = await fetch('/api/clientes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });
      if (res.ok) {
        setClientes(prev => prev.map(c => c.id === cliente.id ? cliente : c));
        if (selectedCliente?.id === cliente.id) setSelectedCliente(cliente);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCliente = async (id: string) => {
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setClientes(prev => prev.filter(c => c.id !== id));
        setAeronaves(prev => prev.filter(a => a.clienteId !== id));
        if (selectedCliente?.id === id) {
          setSelectedCliente(null);
          setSelectedAeronave(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- OPERAÇÕES AERONAVES ---
  const handleAddAeronave = async (noIdAero: Omit<Aeronave, 'id'>) => {
    try {
      const res = await fetch('/api/aeronaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noIdAero)
      });
      if (res.ok) {
        fetchBasics();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateAeronave = async (aero: Aeronave) => {
    try {
      const res = await fetch('/api/aeronaves', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aero)
      });
      if (res.ok) {
        setAeronaves(prev => prev.map(a => a.id === aero.id ? aero : a));
        if (selectedAeronave?.id === aero.id) setSelectedAeronave(aero);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAeronave = async (id: string) => {
    try {
      const res = await fetch(`/api/aeronaves/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAeronaves(prev => prev.filter(a => a.id !== id));
        if (selectedAeronave?.id === id) setSelectedAeronave(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col font-sans" id="main-app">
      {/* Navbar Superior do Sistema */}
      <header className="bg-slate-800/50 border-b border-slate-700/80 sticky top-0 z-40 px-6 py-4 backdrop-blur-md" id="app-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-sky-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-sky-500/15">
              <Plane className="w-5 h-5 rotate-45" />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-white tracking-tight text-xl leading-tight">
                AERO<span className="text-sky-400">MANUT</span>
              </h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Controle de Manutenção Aeronáutica</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-xl text-slate-300">
              <Server className="w-3.5 h-3.5 text-sky-400" />
              VPS: <strong className="text-white font-semibold">Coolify Postgres-Ready</strong>
            </span>
            <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <span className="h-2 w-2 rounded-full bg-emerald-400 block animate-pulse"></span>
              Servidor Conectado
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6" id="app-workspace">
        {selectedAeronave ? (
          /* WORKSPACE INDIVIDUAL DE UMA AERONAVE COM MAPA DE COMPONENTES, HISTÓRICO, LAUDOS E UPLOADS */
          <div className="space-y-4 animate-fade-in">
            <button
              onClick={() => setSelectedAeronave(null)}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-sky-400 bg-slate-800/50 border border-slate-700/50 px-4 py-2.5 rounded-xl cursor-pointer transition-all shadow-md hover:border-slate-600/50"
              id="btn-voltar-frota"
            >
              <ArrowLeft className="w-4 h-4 text-sky-400" />
              Voltar para a Frota de Aeronaves
            </button>
            <AeronaveDetail
              aeronave={selectedAeronave}
              cliente={selectedCliente!}
              onRefreshAeronave={handleRefreshAeronave}
            />
          </div>
        ) : (
          /* PAINEL INICIAL: SELECIONE CLIENTE -> GERENCIE AERONAVES */
          <div className="space-y-6">
            
            {/* Informações Auxiliares */}
            <div className="bg-slate-800/45 border border-slate-700/50 rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4 text-xs shadow-lg">
              <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl flex-shrink-0 border border-sky-500/15">
                <Info className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-display font-bold text-white text-sm">Como funciona o controle de manutenção por horas de voo?</h4>
                <p className="text-slate-300 leading-relaxed">
                  Cadastre o cliente e suas respectivas aeronaves. Nas aeronaves, adicione componentes controlados (instalação e limites de horas/dias). 
                  Toda vez que um voo for adicionado no <strong className="text-sky-400 font-semibold">Diário de Bordo</strong> da aeronave, seu tempo total é atualizado e o sistema recalcula 
                  automaticamente o mapa de alertas e vencimentos de inspeção, sinalizando os gargalos de revisão com antecedência.
                </p>
              </div>
            </div>

            {/* Grid Dividida de Clientes e Aeronaves */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* Clientes (Eixo Esquerdo - 5 das 12 colunas) */}
              <div className="md:col-span-5 h-full">
                <ClientesList
                  clientes={clientes}
                  onSelectCliente={(c) => {
                    setSelectedCliente(c);
                    setSelectedAeronave(null); // Reseta aeronave quando muda de cliente
                  }}
                  selectedClienteId={selectedCliente?.id || null}
                  onAddCliente={handleAddCliente}
                  onUpdateCliente={handleUpdateCliente}
                  onDeleteCliente={handleDeleteCliente}
                  aeronavesCount={aeronavesCountMap}
                />
              </div>

              {/* Aeronaves (Eixo Direito - 7 das 12 colunas) */}
              <div className="md:col-span-7 h-full">
                <AeronavesList
                  aeronaves={aeronaves}
                  selectedCliente={selectedCliente}
                  onSelectAeronave={(a) => setSelectedAeronave(a)}
                  selectedAeronaveId={selectedAeronave?.id || null}
                  onAddAeronave={handleAddAeronave}
                  onUpdateAeronave={handleUpdateAeronave}
                  onDeleteAeronave={handleDeleteAeronave}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Rodapé explicativo de VPS e Coolify PostgreSQL */}
      <footer className="bg-slate-950/75 border-t border-slate-900 mt-12 py-8 px-6 text-xs text-center" id="app-footer">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2 text-sky-400">
            <Database className="w-4 h-4" />
            <h5 className="font-display font-bold tracking-wider uppercase text-[10px]">Configuração Pronta para Produção no Coolify</h5>
          </div>
          <p className="max-w-xl mx-auto leading-relaxed text-slate-400 text-[11px]">
            Este aplicativo está equipado com um adaptador híbrido. No ambiente AI Studio Preview, ele salva os dados no arquivo local 
            <code className="bg-slate-900 text-sky-400 font-semibold px-1.5 py-0.5 rounded ml-1 font-mono">database-local.json</code> para visualização imediata. 
            Ao enviar para a VPS com Coolify, basta configurar a variável de ambiente:
          </p>
          <div className="bg-slate-900 border border-slate-800 text-sky-400 px-4 py-2.5 rounded-xl font-mono text-[11px] w-fit mx-auto select-all shadow-inner">
            DATABASE_URL="postgresql://usuario:senha@seu-postgres-coolify:5432/nomedobanco"
          </div>
          <p className="text-[10px] text-slate-500">
            A infraestrutura criará as tabelas de Clientes, Aeronaves, Componentes, Voos e Revisões automaticamente de forma nativa.
          </p>
        </div>
      </footer>
    </div>
  );
}

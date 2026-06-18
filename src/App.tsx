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
  Server,
  Lock,
  LogOut,
  User,
  Key,
  Compass
} from 'lucide-react';

export default function App() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [selectedAeronave, setSelectedAeronave] = useState<Aeronave | null>(null);
  
  // Controle de Autenticação
  const [userRole, setUserRole] = useState<'admin' | 'cliente' | null>(() => {
    return (localStorage.getItem('aeromanut_userRole') as 'admin' | 'cliente' | null) || null;
  });
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = localStorage.getItem('aeromanut_currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [dbStatus, setDbStatus] = useState<{ connected: boolean; error: string | null }>({
    connected: true, // Começa assumindo conectado para evitar flicker visual no carregamento
    error: null
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados adicionais para configurar a base de dados dinamicamente pela tela de erro
  const [dbHost, setDbHost] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);

  // Efeito para garantir que o cliente logado esteja sempre pré-selecionado
  useEffect(() => {
    if (userRole === 'cliente' && currentUser) {
      setSelectedCliente(currentUser);
    }
  }, [userRole, currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Por favor, digite seu e-mail e senha.');
      return;
    }
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserRole(data.role);
        setCurrentUser(data.user);
        localStorage.setItem('aeromanut_userRole', data.role);
        localStorage.setItem('aeromanut_currentUser', JSON.stringify(data.user));
        
        if (data.role === 'cliente') {
          setSelectedCliente(data.user);
        } else {
          setSelectedCliente(null);
        }
        setSelectedAeronave(null);
      } else {
        setLoginError(data.error || 'E-mail ou senha incorretos.');
      }
    } catch (err) {
      setLoginError('Falha ao conectar com o servidor. Verifique a rede.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setCurrentUser(null);
    setSelectedCliente(null);
    setSelectedAeronave(null);
    localStorage.removeItem('aeromanut_userRole');
    localStorage.removeItem('aeromanut_currentUser');
    setLoginEmail('');
    setLoginPassword('');
    setLoginError(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbHost || !dbUser || !dbPort || !dbName) {
      setConfigError('Por favor, preencha os campos obrigatórios (Host, Usuário, Porta e Nome do Banco).');
      return;
    }
    
    // Constrói a URL de conexão do PostgreSQL
    const constructedUrl = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;
    
    setIsConfiguring(true);
    setConfigError(null);
    setConfigSuccess(null);
    
    try {
      const response = await fetch('/api/config-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ databaseUrl: constructedUrl })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setConfigSuccess('Banco de dados reconfigurado e tabelas inicializadas com sucesso! Sincronizando dados...');
        setTimeout(() => {
          fetchBasics();
          setShowConfigForm(false);
          setConfigSuccess(null);
        }, 1500);
      } else {
        setConfigError(data.error || 'Erro ao conectar na base de dados com as informações fornecidas.');
      }
    } catch (err: any) {
      setConfigError('Erro de rede ao conectar à API do servidor. Verifique se o container está rodando.');
    } finally {
      setIsConfiguring(false);
    }
  };

  // --- BUSCAR DADOS DO BACKEND ---
  const fetchBasics = async () => {
    setIsRefreshing(true);
    try {
      // 1. Primeiro verifica o health-check e conexão com o banco
      const healthRes = await fetch('/api/health');
      if (!healthRes.ok) {
        throw new Error(`O servidor respondeu com status ${healthRes.status}`);
      }
      
      const contentType = healthRes.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('O proxy da VPS retornou uma página HTML em vez de JSON da API (502 Bad Gateway ou fallback estático do Nginx). Verifique se o backend está iniciado.');
      }
      
      let healthData;
      try {
        healthData = await healthRes.json();
      } catch (jsonErr) {
        throw new Error('Resposta inválida do servidor (não é um JSON válido). Possível erro no proxy ou servidor fora do ar.');
      }
      
      const dbInfo = healthData.database || { connected: false, error: 'Sem informações do banco do servidor.' };
      
      if (!dbInfo.connected) {
        setDbStatus({ connected: false, error: dbInfo.error || 'Erro desconhecido ao conectar ao PostgreSQL' });
        setIsRefreshing(false);
        return;
      }

      // 2. Se a conexão estiver ativa, faz a sincronização dos dados
      const [cliRes, aeroRes] = await Promise.all([
        fetch('/api/clientes'),
        fetch('/api/aeronaves')
      ]);

      if (!cliRes.ok || !aeroRes.ok) {
        throw new Error('Falha ao responder com os dados primários de produção.');
      }

      const clientContentType = cliRes.headers.get('content-type');
      const aeroContentType = aeroRes.headers.get('content-type');
      if (!clientContentType?.includes('application/json') || !aeroContentType?.includes('application/json')) {
        throw new Error('Os endpoints de dados retornaram conteúdo inválido (HTML em vez de JSON).');
      }

      const clientList = await cliRes.json();
      const aeroList = await aeroRes.json();

      setClientes(clientList);
      setAeronaves(aeroList);

      // Se for cliente, sincroniza as informações atualizadas do próprio perfil do banco de dados
      const cachedRole = localStorage.getItem('aeromanut_userRole');
      const cachedUser = localStorage.getItem('aeromanut_currentUser');
      if (cachedRole === 'cliente' && cachedUser) {
        const uObj = JSON.parse(cachedUser);
        const latestInfo = clientList.find((c: any) => c.id === uObj.id);
        if (latestInfo) {
          setCurrentUser(latestInfo);
          setSelectedCliente(latestInfo);
          localStorage.setItem('aeromanut_currentUser', JSON.stringify(latestInfo));
        }
      }

      setDbStatus({ connected: true, error: null });
    } catch (e: any) {
      console.error('Falha ao sincronizar dados com o servidor:', e);
      setDbStatus({
        connected: false,
        error: e?.message || 'Erro de rede ao conectar à API.'
      });
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

  // Se não estiver autenticado, renderiza a tela de login primeiro
  if (!userRole) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col justify-between items-center p-6 relative font-sans overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/3 -translate-y-1/2 w-[450px] h-[450px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="my-auto max-w-md w-full text-center space-y-6 relative z-10">
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-sky-500/15 mb-4 border border-sky-400/20">
              <Plane className="w-8 h-8 rotate-45" />
            </div>
            <h1 className="font-display font-extrabold text-white tracking-tight text-3xl">
              AERO<span className="text-sky-400">MANUT</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1.5">Controle de Manutenção Aeronáutica</p>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 sm:p-8 text-left space-y-5 shadow-2xl">
            <div className="border-b border-slate-800/60 pb-3">
              <h2 className="font-display font-bold text-white text-lg">Área de Acesso</h2>
              <p className="text-xs text-slate-400 mt-1">Insira suas credenciais para gerenciar a frota</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">E-mail (Login)</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Ex: seuemail@provedor.com"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-600"
                    disabled={isLoggingIn}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha de acesso"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-sky-500 text-slate-200 placeholder-slate-600"
                    disabled={isLoggingIn}
                  />
                </div>
              </div>

              {loginError && (
                <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-3 text-[11px] text-red-400 flex items-start gap-2 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-605 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-sky-500/10 active:scale-[0.98]"
              >
                {isLoggingIn ? (
                  <>
                    <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Autenticando...
                  </>
                ) : (
                  'Entrar no Painel'
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block font-sans">Dicas de Acesso Rápido:</span>
              <div className="bg-slate-950/70 border border-slate-850 rounded-xl p-3 text-[11px] text-slate-400 space-y-1.5 font-mono">
                <div>
                  <span className="text-sky-400 font-semibold block">Acesso Administrador:</span>
                  <div className="text-[10px] text-slate-350 mt-0.5">E-mail: <span className="text-white">lucastrombeta@gmail.com</span></div>
                  <div className="text-[10px] text-slate-350">Senha: <span className="text-white">admin123</span></div>
                </div>
                <div className="border-t border-slate-900 pt-1.5">
                  <span className="text-emerald-400 font-semibold block">Acesso do Cliente:</span>
                  <p className="text-[10px] leading-relaxed text-slate-400 mt-0.5 font-sans">
                    Use o e-mail e a senha cadastrados lá no registro de clientes para o cliente acessar seu perfil aeronáutico próprio de forma restrita.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full text-center text-[10px] text-slate-600">
          AeroManut • Acesso Restrito • {new Date().getFullYear()}
        </div>
      </div>
    );
  }

  if (!dbStatus.connected) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col justify-between items-center p-6 relative font-sans overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-[250px] h-[250px] bg-sky-500/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="my-auto max-w-xl w-full text-center space-y-8 relative z-10">
          <div className="flex flex-col items-center">
            {/* Animated Red Alert Core */}
            <div className="relative flex items-center justify-center">
              <div className="absolute h-24 w-24 bg-red-500/20 rounded-full animate-ping pointer-events-none" />
              <div className="h-20 w-20 bg-gradient-to-br from-red-600 to-rose-700 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-red-950/50 border border-red-500/20">
                <Database className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 bg-slate-900 border border-slate-950 rounded-full flex items-center justify-center text-red-500 shadow-md">
                <ShieldAlert className="w-4 h-4 animate-bounce" />
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <span className="text-red-400 text-xs font-bold uppercase tracking-widest bg-red-950/50 border border-red-900/40 px-3 py-1 rounded-full">
                Erro de Conexão Crítico
              </span>
              <h2 className="font-display font-extrabold text-white text-2xl sm:text-3xl tracking-tight leading-tight">
                Falha ao conectar com o PostgreSQL
              </h2>
            </div>
          </div>

          <div className="bg-slate-900/85 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 text-left space-y-4 shadow-xl">
            <p className="text-slate-300 text-sm leading-relaxed">
              O aplicativo <strong className="text-white">AeroManut</strong> está configurado em modo estrito de produção para VPS. O sistema requer uma conexão ativa com o banco de dados PostgreSQL antes de inicializar o painel, não sendo permitido conexões ou armazenamentos locais temporários.
            </p>

            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Detalhes do Erro Técnico:
              </span>
              <div className="bg-slate-950 border border-red-950/50 text-red-400 font-mono text-xs rounded-xl p-4 whitespace-pre-wrap select-all shadow-inner max-h-48 overflow-y-auto leading-relaxed">
                {dbStatus.error || 'Nenhum detalhe adicional de erro retornado pelo servidor.'}
              </div>
            </div>

            {/* FORMULÁRIO DE CONFIGURAÇÃO MANUAL DENTRO DA TELA DE ERRO */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              {!showConfigForm ? (
                <button
                  type="button"
                  onClick={() => setShowConfigForm(true)}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl text-xs font-semibold text-sky-400 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  Configurar Conexão Manualmente (Bypass VPS)
                </button>
              ) : (
                <form onSubmit={handleSaveConfig} className="space-y-3 bg-slate-950/60 p-4 border border-slate-850 rounded-xl text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-sky-400" />
                      Configurar Conexão Direta
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowConfigForm(false);
                        setConfigError(null);
                        setConfigSuccess(null);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-300"
                    >
                      Cancelar
                    </button>
                  </div>
                  
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Informe os dados de conexão do seu PostgreSQL. Eles serão validados e configurados diretamente na aplicação de forma sobressalente.
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Host / Servidor:
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-all font-mono"
                        placeholder="Ex: postgres-db ou ip_vps"
                        value={dbHost}
                        onChange={(e) => setDbHost(e.target.value)}
                        disabled={isConfiguring}
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Porta:
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-all font-mono"
                        placeholder="5432"
                        value={dbPort}
                        onChange={(e) => setDbPort(e.target.value)}
                        disabled={isConfiguring}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Usuário:
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-all font-mono"
                        placeholder="Ex: postgres"
                        value={dbUser}
                        onChange={(e) => setDbUser(e.target.value)}
                        disabled={isConfiguring}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Senha:
                      </label>
                      <input
                        type="password"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-all font-mono"
                        placeholder="Sua senha"
                        value={dbPassword}
                        onChange={(e) => setDbPassword(e.target.value)}
                        disabled={isConfiguring}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Nome do Banco de Dados:
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-all font-mono"
                      placeholder="Ex: aviation2"
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      disabled={isConfiguring}
                    />
                  </div>

                  {configError && (
                    <div className="bg-red-950/40 border border-red-900/55 rounded-lg p-2.5 text-[11px] text-red-400 font-mono whitespace-pre-wrap leading-normal">
                      {configError}
                    </div>
                  )}

                  {configSuccess && (
                    <div className="bg-emerald-950/40 border border-emerald-900/55 rounded-lg p-2.5 text-[11px] text-emerald-400 leading-normal font-sans">
                      {configSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isConfiguring}
                    className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-450 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/10"
                  >
                    {isConfiguring ? (
                      <>
                        <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Testando e Gravando...
                      </>
                    ) : (
                      'Salvar e Testar Conexão'
                    )}
                  </button>
                </form>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Server className="w-3 h-3 text-sky-400" />
                Dicas de Solução para VPS / Coolify:
              </span>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside leading-normal">
                <li>
                  <strong className="text-slate-200">Rede Docker (Coolify):</strong> Se o PostgreSQL estiver rodando em outro container na VPS, certifique-se de que ambos os serviços pertencem à mesma rede privada do Docker.
                </li>
                <li>
                  <strong className="text-slate-200">Endereço Interno vs Externo:</strong> Não use <code className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">localhost</code> ou o endereço IP externo dentro da VPS. Use o <strong className="text-slate-200">Domain / Internal Hostname</strong> do container PostgreSQL que o Coolify fornece (ex: <code className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">database-service-name</code> ou o formato <code className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">postgresql://usuario:senha@service-id:5432/db</code>).
                </li>
                <li>
                  Use a <strong className="text-slate-200">Internal Connection String</strong> disponível na aba de configurações do banco de dados no painel do Coolify.
                </li>
                <li>
                  Certifique-se de preencher a variável <code className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">DATABASE_URL</code> ou o conjunto <code className="text-slate-200 font-mono bg-slate-950 px-1 py-0.5 rounded">PGHOST</code> nos Environment Variables do container do aplicativo no Coolify.
                </li>
              </ul>
            </div>
          </div>

          <button
            onClick={fetchBasics}
            disabled={isRefreshing}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-bold text-sm px-6 py-4 rounded-xl cursor-pointer shadow-lg shadow-sky-500/10 hover:shadow-sky-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isRefreshing ? (
              <>
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Tentando Reconectar...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Verificar Conexão Novamente
              </>
            )}
          </button>
        </div>

        <div className="w-full text-center text-[10px] text-slate-600 mt-8">
          AeroManut • Modo Estrito de Produção • VPS Engine
        </div>
      </div>
    );
  }

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

          <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-700/30 sm:border-transparent">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-slate-700/60 rounded-lg flex items-center justify-center border border-slate-600/30">
                <User className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-left">
                <div className="text-[11px] font-bold text-slate-200">
                  {currentUser?.nome || 'Usuário'}
                </div>
                <div className="text-[9px] text-sky-400 font-semibold tracking-wider uppercase font-mono">
                  {userRole === 'admin' ? 'Administrador' : 'Acesso Cliente'}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/20 hover:bg-red-950/60 border border-red-900/40 text-[11px] font-semibold text-red-400 transition-all cursor-pointer"
              title="Sair do Sistema"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
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
              {userRole === 'admin' && (
                <div className="md:col-span-12 lg:col-span-5 h-full">
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
              )}

              {/* Aeronaves (Eixo Direito - 7 das 12 colunas ou 12 cheias se cliente) */}
              <div className={userRole === 'admin' ? "md:col-span-12 lg:col-span-7 h-full" : "md:col-span-12 h-full"}>
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

      {/* Rodapé do Sistema */}
      <footer className="bg-slate-950/75 border-t border-slate-900 mt-12 py-6 px-6 text-xs text-center text-slate-500" id="app-footer">
        <div className="max-w-7xl mx-auto">
          <p>© {new Date().getFullYear()} AeroManut - Sistema de Controle de Manutenção Aeronáutica.</p>
        </div>
      </footer>
    </div>
  );
}

/* Assistente do Portal do Cliente — conteúdo: Constantes e estado compartilhado do conteúdo.
 * Parte de content/ (dividido na 2.17.0; mapa em docs/arquitetura.md). Script comum: compartilha o escopo do mundo isolado
 * com os outros arquivos de content/ (a ordem de carga está no manifest e no simulador). */
/* Faz só o trabalho de "mãos": lê a tela, preenche campos, anexa arquivos, mostra o painel e o aviso de arrastar.
 * Toda a inteligência fica no painel (iframe da extensão). */
window.__ctAssistente = true;


const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
const VERSAO = chrome.runtime.getManifest().version;   // versão desta cópia do script (fica velha se a extensão for atualizada sem recarregar a página)
// Plataforma: na extensão real não existe (mundo isolado); no simulador, a página fornece rota, navegação e listas.
const plat = window.__ctPlatform || {};
const currentPath = () => (plat.path ? plat.path() : location.pathname);
const BASE = '/clientcenter/pt/actions/service-request/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

let rules = null;
let port = null;
// Modo da tela: 'fechado' (só o botão), 'painel' (encaixado ao lado do portal) ou
// 'plataforma' (tela cheia por cima do portal, que continua carregado e é preenchido por baixo).
let modo = 'fechado';
let modoAberto = 'plataforma';   // o que o botão "Assistente" abre
let lastHref = '';
let bypassGuard = false;
const optionsCache = new Map();

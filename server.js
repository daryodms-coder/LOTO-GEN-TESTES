// server.js

// --- DEPENDÊNCIAS ---
const express = require('express');
const fs = require('fs').promises; // Usando a versão baseada em Promises do 'fs'
const cron = require('node-cron');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require('cors');

// --- CONFIGURAÇÕES ---
const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = './db.json';

const LOTTERY_GAMES = [
    'lotofacil', 'megasena', 'maismilionaria', 'quina', 'lotomania',
    'timemania', 'duplasena', 'diadesorte', 'supersete'
];
const CONTESTS_TO_STORE = 500;

// Habilita o CORS para que seu front-end possa acessar a API
app.use(cors());

// --- FUNÇÕES PRINCIPAIS DA API ---

/**
 * Busca os dados de um concurso específico da API da Caixa.
 * @param {string} game - O nome do jogo (ex: 'megasena').
 * @param {number|null} contestNumber - O número do concurso ou null para o mais recente.
 * @returns {Promise<object|null>} Os dados do concurso ou null em caso de erro.
 */
async function fetchContestData(game, contestNumber = null) {
    const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/${game}/${contestNumber || ''}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Erro ao buscar ${game} #${contestNumber}: Status ${response.status}`);
            return null;
        }
        const data = await response.json();
        // Validação simples para concursos que não existem
        if (data.numero === 0) return null;
        return data;
    } catch (error) {
        console.error(`Falha na requisição para ${game} #${contestNumber}:`, error.message);
        return null;
    }
}

/**
 * Inicializa o banco de dados (db.json) buscando os últimos 500 concursos de cada jogo.
 * Só é executada se o arquivo db.json não existir.
 */
async function initializeDatabase() {
    console.log('Verificando banco de dados...');
    try {
        await fs.access(DB_PATH);
        console.log('Banco de dados (db.json) já existe. Pulando inicialização.');
        return;
    } catch (error) {
        console.log('db.json não encontrado. Iniciando busca de dados históricos...');
        const database = {};

        for (const game of LOTTERY_GAMES) {
            console.log(`Buscando histórico para: ${game}...`);
            const latestContest = await fetchContestData(game);
            if (!latestContest || !latestContest.numero) {
                console.warn(`Não foi possível obter o concurso mais recente de ${game}.`);
                continue;
            }

            const latestContestNumber = latestContest.numero;
            const promises = [];

            for (let i = 0; i < CONTESTS_TO_STORE; i++) {
                const contestNum = latestContestNumber - i;
                if (contestNum > 0) {
                    promises.push(fetchContestData(game, contestNum));
                }
            }

            const results = await Promise.all(promises);
            database[game] = results.filter(r => r !== null).sort((a, b) => a.numero - b.numero);
            console.log(`- ${game}: ${database[game].length} concursos armazenados.`);
        }

        await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2));
        console.log('Banco de dados inicializado com sucesso!');
    }
}

/**
 * Atualiza o banco de dados com os concursos mais recentes.
 */
async function updateDatabase() {
    console.log(`[${new Date().toLocaleString('pt-BR')}] Iniciando atualização agendada do banco de dados...`);
    let database;
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        database = JSON.parse(data);
    } catch (error) {
        console.error('Não foi possível ler o db.json para atualização. Rode a inicialização primeiro.', error);
        return;
    }

    for (const game of LOTTERY_GAMES) {
        const latestContest = await fetchContestData(game);
        if (!latestContest || !latestContest.numero) {
            console.warn(`- Não foi possível obter o concurso mais recente de ${game} para atualização.`);
            continue;
        }

        const latestApiNumber = latestContest.numero;
        const storedContests = database[game] || [];
        const latestStoredNumber = storedContests.length > 0 ? Math.max(...storedContests.map(c => c.numero)) : 0;

        if (latestApiNumber > latestStoredNumber) {
            console.log(`- Novos concursos encontrados para ${game}. Último salvo: ${latestStoredNumber}, último na API: ${latestApiNumber}`);
            const contestsToFetch = [];
            for (let num = latestStoredNumber + 1; num <= latestApiNumber; num++) {
                contestsToFetch.push(fetchContestData(game, num));
            }

            const newResults = (await Promise.all(contestsToFetch)).filter(r => r !== null);
            
            if (newResults.length > 0) {
                const updatedContests = [...storedContests, ...newResults]
                    .sort((a, b) => b.numero - a.numero) // Ordena do mais novo para o mais antigo
                    .slice(0, CONTESTS_TO_STORE) // Mantém apenas os últimos 500
                    .sort((a, b) => a.numero - b.numero); // Reordena do mais antigo para o mais novo

                database[game] = updatedContests;
                console.log(`- ${game} atualizado com ${newResults.length} novo(s) concurso(s).`);
            }
        } else {
            console.log(`- ${game} já está atualizado.`);
        }
    }

    await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2));
    console.log('Atualização agendada concluída.');
}


// --- ROTAS DA API ---

// Rota principal para servir os dados de um jogo específico
app.get('/api/resultados/:gameName', async (req, res) => {
    const { gameName } = req.params;
    if (!LOTTERY_GAMES.includes(gameName)) {
        return res.status(404).json({ error: 'Jogo não encontrado.' });
    }

    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const database = JSON.parse(data);
        const gameData = database[gameName] || [];
        
        // Retorna os dados ordenados do mais recente para o mais antigo
        res.json([...gameData].sort((a, b) => b.numero - a.numero));
    } catch (error) {
        res.status(500).json({ error: 'Erro ao ler o banco de dados.' });
    }
});

// Rota para servir todos os resultados
app.get('/api/resultados', async (req, res) => {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const database = JSON.parse(data);
        res.json(database);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao ler o banco de dados.' });
    }
});


// --- INICIALIZAÇÃO E AGENDAMENTO ---

// Agenda a atualização para rodar a cada 30 segundos.
cron.schedule('0 21 * * *', updateDatabase, {
    timezone: "America/Sao_Paulo"
});

// Inicia o servidor
app.listen(PORT, async () => {
    console.log(`Servidor da API de Loterias rodando na porta ${PORT}`);
    // Garante que o banco de dados seja criado na primeira vez que o servidor sobe
    await initializeDatabase();
});


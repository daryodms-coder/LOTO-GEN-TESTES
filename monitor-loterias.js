const axios = require('axios');
const fs = require('fs');

// Lista completa das modalidades de loteria da Caixa
const loterias = [
    { nome: 'megasena', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena' },
    { nome: 'lotofacil', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil' },
    { nome: 'quina', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/quina' },
    { nome: 'lotomania', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotomania' },
    { nome: 'timemania', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/timemania' },
    { nome: 'duplasena', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena' },
    { nome: 'diadesorte', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/diadesorte' },
    { nome: 'supersete', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/supersete' },
    { nome: 'maismilionaria', url: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/maismilionaria' }
];

async function fetchLoteriaData() {
    const resultados = {};
    const timestamp = new Date().toISOString();

    for (const loteria of loterias) {
        try {
            const response = await axios.get(loteria.url);
            // Correção: Salva o objeto de dados completo retornado pela API
            // e adiciona um campo para sabermos quando foi a última atualização.
            resultados[loteria.nome] = {
                ...response.data, // Isso garante que todos os dados (prêmio, data, ganhadores) sejam salvos
                ultimaAtualizacao: timestamp
            };
            console.log(`Dados de ${loteria.nome} capturados com sucesso`);
        } catch (error) {
            console.error(`Erro ao buscar dados de ${loteria.nome}:`, error.message);
            resultados[loteria.nome] = { erro: error.message, ultimaAtualizacao: timestamp };
        }
    }

    // Salva os dados no arquivo JSON
    fs.writeFileSync('loterias.json', JSON.stringify(resultados, null, 2));
    console.log('Arquivo loterias.json atualizado:', timestamp);
}

// Executa imediatamente e depois a cada 30 minutos.
// 30 segundos é muito frequente e pode levar ao bloqueio do seu acesso.
const cron = require('node-cron'); // Certifique-se de que a biblioteca está importada

// Executa a função uma vez ao iniciar a aplicação (opcional)
fetchLoteriaData(); 

// Agenda a função para ser executada todos os dias às 21:00
cron.schedule('0 21 * * *', fetchLoteriaData, {
    timezone: "America/Sao_Paulo"
});

console.log('Monitoramento das loterias iniciado. A próxima atualização será às 21:00.');


const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Константы для работы с Base API
const BASE_API_URL = 'https://api.basescan.org/api';
const API_KEY = 'G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC';
const KEETA_CONTRACT = '0xc0634090F2Fe6c6d75e61Be2b949464aBB498973';

// Функция для получения баланса токена
async function getTokenBalance(walletAddress, contractAddress) {
  try {
    const response = await axios.get(BASE_API_URL, {
      params: {
        module: 'account',
        action: 'tokenbalance',
        contractaddress: contractAddress,
        address: walletAddress,
        tag: 'latest',
        apikey: API_KEY
      }
    });

    if (response.data.status === '1') {
      // Преобразуем из wei в обычные токены (обычно 18 десятичных знаков)
      const balance = parseFloat(response.data.result) / Math.pow(10, 18);
      return balance;
    } else {
      return 0;
    }
  } catch (error) {
    console.error(`Ошибка при получении баланса для ${walletAddress}:`, error.message);
    return 0;
  }
}

// Функция для валидации адреса Ethereum/Base
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Основной маршрут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API endpoint для анализа балансов
app.post('/api/analyze', async (req, res) => {
  try {
    const { addresses } = req.body;

    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: 'Необходимо предоставить массив адресов' });
    }

    // Фильтруем и валидируем адреса
    const validAddresses = addresses
      .map(addr => addr.trim())
      .filter(addr => addr && isValidAddress(addr));

    if (validAddresses.length === 0) {
      return res.status(400).json({ error: 'Не найдено валидных адресов' });
    }

    // Получаем балансы для всех адресов
    const results = [];
    
    for (const address of validAddresses) {
      const balance = await getTokenBalance(address, KEETA_CONTRACT);
      results.push({
        address,
        balance: balance.toFixed(6), // Округляем до 6 знаков после запятой
        formattedBalance: balance.toLocaleString('ru-RU', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 6
        })
      });
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({ results });

  } catch (error) {
    console.error('Ошибка при анализе балансов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

const PORT = process.env.PORT || 3000;

// Для локального запуска
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}

module.exports = app;
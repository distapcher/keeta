export default async function handler(req, res) {
  // Пример ответа
  res.status(200).json({
    message: "API работает!",
    timestamp: new Date().toISOString()
  });
}

export default async function handler(req, res) {
  // Пример ответа API
  res.status(200).json({
    message: "API работает без node-fetch!",
    timestamp: new Date().toISOString()
  });
}

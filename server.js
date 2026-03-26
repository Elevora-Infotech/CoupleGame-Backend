const app = require('./src/app');
const { env } = require('./src/config/env');

const PORT = env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${env.NODE_ENV}`);
});

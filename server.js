const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS
app.use(cors({ 
    origin: '*', 
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] 
}));
app.use(express.json({ limit: '15mb' }));

// PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer с лимитом 15 МБ
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 } // 15 МБ
});

// ============================================================
//  GET: Получение проектов
// ============================================================
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка GET:', err);
        res.status(500).json({ error: 'Не удалось загрузить карточки' });
    }
});

// ============================================================
//  POST: Создание проекта
// ============================================================
app.post('/api/projects', upload.single('image'), async (req, res) => {
    try {
        const { title, description, project_url, imageUrlString } = req.body;
        
        // Валидация
        if (!title || !description) {
            return res.status(400).json({ error: 'Название и описание обязательны' });
        }
        
        let cloudinaryResponse;

        if (req.file) {
            const fileBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            cloudinaryResponse = await cloudinary.uploader.upload(fileBase64, { 
                folder: 'portfolio_bundle',
                transformation: [
                    { width: 800, height: 600, crop: 'limit' },
                    { quality: 'auto' }
                ]
            });
        } else if (imageUrlString && imageUrlString.trim().length > 0) {
            cloudinaryResponse = await cloudinary.uploader.upload(imageUrlString, { 
                folder: 'portfolio_bundle',
                transformation: [
                    { width: 800, height: 600, crop: 'limit' },
                    { quality: 'auto' }
                ]
            });
        } else {
            return res.status(400).json({ error: 'Не предоставлен файл или ссылка на картинку' });
        }

        const queryText = `
            INSERT INTO projects (title, description, image_url, cloudinary_id, project_url)
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const values = [
            title.trim(), 
            description.trim(), 
            cloudinaryResponse.secure_url, 
            cloudinaryResponse.public_id, 
            project_url?.trim() || null
        ];
        
        const dbResult = await pool.query(queryText, values);
        res.status(201).json(dbResult.rows[0]);
        
    } catch (err) {
        console.error('❌ Ошибка POST:', err);
        res.status(500).json({ error: 'Ошибка сервера при сохранении проекта' });
    }
});

// ============================================================
//  DELETE: Удаление проекта
// ============================================================
app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const checkResult = await pool.query('SELECT cloudinary_id FROM projects WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        // Удаляем из Cloudinary
        try {
            await cloudinary.uploader.destroy(checkResult.rows[0].cloudinary_id);
        } catch (cloudinaryErr) {
            console.warn('⚠️ Не удалось удалить из Cloudinary:', cloudinaryErr.message);
        }
        
        // Удаляем из БД
        await pool.query('DELETE FROM projects WHERE id = $1', [id]);
        res.status(200).json({ success: true });
        
    } catch (err) {
        console.error('❌ Ошибка DELETE:', err);
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

// ============================================================
//  Health Check
// ============================================================
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================
//  Запуск сервера
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📁 Режим: ${process.env.NODE_ENV || 'development'}`);
});
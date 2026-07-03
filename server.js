const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE'] }));
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// GET: Получение проектов
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Не удалось загрузить карточки' });
    }
});

// POST: Создание проекта (Гибридный режим: файл или ссылка)
app.post('/api/projects', upload.single('image'), async (req, res) => {
    try {
        const { title, description, project_url, imageUrlString } = req.body;
        let cloudinaryResponse;

        if (req.file) {
            const fileBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            cloudinaryResponse = await cloudinary.uploader.upload(fileBase64, { folder: 'portfolio_bundle' });
        } else if (imageUrlString) {
            cloudinaryResponse = await cloudinary.uploader.upload(imageUrlString, { folder: 'portfolio_bundle' });
        } else {
            return res.status(400).json({ error: 'Не предоставлен файл или ссылка на картинку' });
        }

        const queryText = `
            INSERT INTO projects (title, description, image_url, cloudinary_id, project_url)
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const values = [title, description, cloudinaryResponse.secure_url, cloudinaryResponse.public_id, project_url];
        
        const dbResult = await pool.query(queryText, values);
        res.status(201).json(dbResult.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера при сохранении проекта' });
    }
});

// DELETE: Удаление проекта
app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const checkResult = await pool.query('SELECT cloudinary_id FROM projects WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) return res.status(404).json({ error: 'Проект не найден' });

        await cloudinary.uploader.destroy(checkResult.rows[0].cloudinary_id);
        await pool.query('DELETE FROM projects WHERE id = $1', [id]);

        res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Новый боевой сервер запущен: http://localhost:${PORT}`);
});

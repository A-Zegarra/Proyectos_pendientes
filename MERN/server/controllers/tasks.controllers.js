import { pool } from '../db.js'

export const getTasks = async (req, res) => {
    const [result] = await pool.query("SELECT * FROM tasks ORDER BY createAt ASC");
    res.json(result);
}



export const getTask = async (req, res) => {
    const [result] = await pool.query("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (result.length == 0)
        return res.status(404).json({ message: "Task no encontrado" });

    res.json(result[0]);
}


export const createTask = async (req, res) => {
    const { title, descripcion } = req.body
    const [result] = await pool.query(
        'INSERT INTO tasks(title,descripcion) VALUES (?,?)',
        [title, descripcion]
    );
    res.json({
        id: result.insertId, title, descripcion,
    });
};
export const updateTask = (req, res) => {
    res.send('actualizando tarea')
}
export const deleteTask = (req, res) => {
    res.send('eliminando tarea')
}
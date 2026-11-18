import express, { type Request, type Response, Router } from "express";
import { initDatabase } from "./database.js";

const app = express();
const route = Router();

initDatabase();

app.use(express.json());

route.get('/', (req: Request, res: Response) => {
  res.json({message: 'Hello World with Typescript'});
});

app.use(route);

app.listen(3333, ()=> 'server running on port 3333');

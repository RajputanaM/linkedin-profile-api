import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header("x-api-key");
  if (!provided || provided !== env.apiKey) {
    res.status(401).json({ error: "Missing or invalid x-api-key header" });
    return;
  }
  next();
}

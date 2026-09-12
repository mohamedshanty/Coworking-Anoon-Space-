import { Request, Response, NextFunction } from "express";
import { employeesService } from "./service";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} from "./schema";

export class EmployeesController {
  async listEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { active } = listEmployeesQuerySchema.parse(req.query);
      const data = await employeesService.listEmployees(
        active === undefined ? undefined : active === "true",
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createEmployeeSchema.parse(req.body);
      const data = await employeesService.createEmployee(input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateEmployeeSchema.parse(req.body);
      const data = await employeesService.updateEmployee(id, input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async deleteEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await employeesService.deleteEmployee(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const employeesController = new EmployeesController();

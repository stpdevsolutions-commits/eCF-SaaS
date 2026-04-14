import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { EcfService } from "../services/ecf.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Controller("ecf")
@UseGuards(JwtAuthGuard)
export class EcfController {
  constructor(private ecfService: EcfService) {}
  @Post() create(@Body() data: any) { return this.ecfService.create(data); }
  @Get() findAll() { return this.ecfService.findAll(); }
}

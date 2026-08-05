import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { TeamRoles } from '../../common/decorators/team-roles.decorator';
import { TeamMemberGuard } from '../../common/guards/team-member.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/team.dto';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTeamDto) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true },
    });

    return this.teams.create(user.id, account.name, dto);
  }

  @UseGuards(TeamMemberGuard)
  @Get(':teamId')
  findOne(@Param('teamId', ParseUUIDPipe) teamId: string) {
    return this.teams.findOne(teamId);
  }

  @UseGuards(TeamMemberGuard)
  @TeamRoles('OWNER', 'LEADER')
  @Patch(':teamId')
  update(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teams.update(teamId, dto);
  }
}

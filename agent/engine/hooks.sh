#!/bin/sh
# Вцепляет интерфейс агента в клиент двумя строчками.
#
# Отдельным скриптом, а не патчем: патч из нескольких кусков разваливается на
# каждом обновлении движка, а две подстановки по якорям переживают почти всё.
# Если якорь исчезнет, сборка упадёт здесь и скажет об этом прямо.
set -eu

fail() { echo "hooks.sh: не найден якорь — $1" >&2; exit 1; }

# 1. Файл в сборку клиента
grep -q 'client/cl_input.c' cmake/client.cmake || fail "список файлов клиента"
sed -i 's#\(.*client/cl_input.c\)#    ${SOURCE_DIR}/client/cl_agent.c\n\1#' cmake/client.cmake

# 2. Объявления. Якорь — CL_InitInput: CL_FinishMove в заголовке не объявлен
# вовсе, хотя и не static, поэтому его объявляем у себя в cl_agent.c.
grep -q 'void CL_InitInput(void);' code/client/client.h || fail "объявления в client.h"
sed -i 's#void CL_InitInput(void);#void CL_InitInput(void);\nvoid CL_AgentInit( void );\nvoid CL_AgentSnapshot( void );\nqboolean CL_AgentActive( void );\nqboolean CL_AgentCommand( usercmd_t *cmd );#' code/client/client.h

# 3. Подмена команды управления: агент задаёт углы и движение сам
grep -q 'CL_FinishMove( &cmd );' code/client/cl_input.c || fail "сборка команды"
sed -i 's#\tCL_FinishMove( &cmd );#\tif ( CL_AgentCommand( \&cmd ) ) {\n\t\treturn cmd;\n\t}\n\tCL_FinishMove( \&cmd );#' code/client/cl_input.c

# 4. Отправка состояния: сразу после того, как снапшот стал годным
grep -q 'cl.newSnapshots = qtrue;' code/client/cl_parse.c || fail "разбор снапшота"
sed -i 's#\tcl.newSnapshots = qtrue;#\tcl.newSnapshots = qtrue;\n\tCL_AgentSnapshot();#' code/client/cl_parse.c

# 5. Инициализация
grep -q 'CL_InitInput ();' code/client/cl_main.c || fail "инициализация клиента"
sed -i 's#\tCL_InitInput ();#\tCL_InitInput ();\n\tCL_AgentInit();#' code/client/cl_main.c

echo "hooks.sh: интерфейс агента вцеплен"

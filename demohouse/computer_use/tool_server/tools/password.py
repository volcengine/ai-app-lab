import subprocess
import sys
import ctypes

def run_command_as_admin(command):
    try:
        if ctypes.windll.shell32.IsUserAnAdmin() == 0:
            ctypes.windll.shell32.ShellExecuteW(
                None, "runas", sys.executable, " ".join(sys.argv), None, 1
            )
            return None
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True
        )
        if result.returncode == 0:
            return ""
        else:
            return result.stderr
    except Exception as e:
        return str(e)


async def change_password(user, new_password):
    command = "net user " + user + " " + new_password
    return {"Result": run_command_as_admin(command)}

# cron: 7 8 * * *
# name: phase0-python
import os
print('PHASE0 python ' + os.getenv('BASELINE_ENV', 'missing'))

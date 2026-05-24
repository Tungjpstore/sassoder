# LogiVN AI Lab on NVIDIA DSX Air

This folder contains the DSX Air topology for the LogiVN AI Lab.

## Topology

Use `logivn-ai-lab-topology.json` when creating a DSX Air simulation.

| Node | Purpose | vCPU | RAM | Storage |
| --- | --- | ---: | ---: | ---: |
| `logivn-ai-core` | AI Gateway, LogiBot, RAG API, Redis/BullMQ, orchestration | 32 | 40 GB | 200 GB |
| `logivn-ai-worker` | OCR, analytics, forecasting, batch jobs | 16 | 12 GB | 120 GB |
| `oob-mgmt-server` | DSX Air management network | 2 | 2 GB | 20 GB |
| `oob-mgmt-switch` | DSX Air management switch | 1 | 1 GB | 10 GB |

Total allocation: 51 vCPU, 55 GB RAM, 350 GB storage.

This stays below the current 60 vCPU / 60 GB concurrent quota and leaves a small safety buffer.

## Create Simulation

1. Open `https://dsx-air.nvidia.com/simulations`.
2. Click **Create Simulation**.
3. Name it `logivn-ai-lab`.
4. Select JSON topology import.
5. Upload `infra/dsx-air/logivn-ai-lab-topology.json`.
6. Keep OOB management enabled.
7. Create the simulation.
8. Review the topology before starting.
9. Start the simulation only after the node sizes look correct.

Important: after a DSX Air simulation starts for the first time, nodes cannot be edited unless the simulation is reverted.

## Services to Expose

Expose only what is needed:

| Node | Service | Port | Access |
| --- | --- | ---: | --- |
| `logivn-ai-core` | SSH | 22 | Admin only |
| `logivn-ai-core` | AI Gateway | 8080 | Main backend/VPS only |
| `logivn-ai-core` | Grafana, optional | 3000 | Admin only |
| `logivn-ai-worker` | SSH | 22 | Admin only |

Do not expose Redis, Postgres, vector DB, or model-serving ports publicly.

## Intended Runtime Layout

`logivn-ai-core`:

- FastAPI AI Gateway
- LogiBot API
- RAG query service
- Redis queue/cache
- Agent orchestrator
- Prometheus/Grafana optional

`logivn-ai-worker`:

- OCR workers
- Analytics and forecast workers
- RAG indexing workers
- Batch report generation

## Post-Start Checks

Run these checks after the simulation is running:

```bash
df -h
free -h
nproc
ip addr
ping -c 3 8.8.8.8
```

If increased storage is not visible, grow the partition on the affected node:

```bash
sudo growpart /dev/vda 1
sudo resize2fs /dev/vda1
df -h | grep vda1
```

## Cost Guardrails

- Stop the simulation when not actively testing.
- Keep model-serving experiments manual until GPU availability is confirmed.
- Use hosted/API fallback for heavy LLM reasoning if DSX Air is CPU-only.
- Run OCR and analytics through queues with concurrency limits.
- Cache common KPI and RAG answers aggressively.

// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { RefObject, useEffect, useRef, useState } from 'react';

import { Page } from 'puppeteer-core';
import { connect } from 'puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js';
import { Button, Drawer, Modal } from '@arco-design/web-react';

import { ReactComponent as IconExit } from '@/demo/mcp/assets/icon_exit.svg';
import { Event } from '@/demo/mcp/types/event';

import styles from './index.module.less';

interface LiveModeProps {
  wsURL: string;
  data: Event;
  isHITL: boolean;
  setIsHITL: (visible: boolean) => void;
  onSaveScreencastFrame: (screencastFrame: string) => void;
}

export const BrowserUseLive: React.FC<LiveModeProps> = ({ wsURL, data, isHITL, setIsHITL, onSaveScreencastFrame }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawerCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawerContainerRef = useRef<HTMLDivElement>(null);
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const pageRef = useRef<Page | null>(null);
  const clientRef = useRef<any>(null);
  const browserRef = useRef<any>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [controlText, setControlText] = useState('');
  // const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);

  const getModifiersForEvent = (event: any) =>
    (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);

  const handleInteraction = (event: MouseEvent | WheelEvent) => {
    if (!clientRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const canvas = isHITL ? drawerCanvasRef.current : canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    if (event instanceof WheelEvent) {
      clientRef.current
        .send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x,
          y,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          modifiers: getModifiersForEvent(event),
        })
        .catch(console.error);
    } else if (event instanceof MouseEvent) {
      const buttons = { 0: 'none', 1: 'left', 2: 'middle', 3: 'right' };
      const eventType = event.type;
      const mouseEventMap = {
        mousedown: 'mousePressed',
        mouseup: 'mouseReleased',
        mousemove: 'mouseMoved',
      };
      const type = mouseEventMap[eventType as keyof typeof mouseEventMap];
      if (!type) {
        return;
      }

      clientRef.current
        .send('Input.dispatchMouseEvent', {
          type,
          x,
          y,
          button: (buttons as any)[event.which],
          modifiers: getModifiersForEvent(event),
          clickCount: 1,
        })
        .catch(console.error);
    }
  };

  const handleKeyEvent = (event: KeyboardEvent) => {
    if (!clientRef.current) {
      return;
    }
    if (event.keyCode === 8) {
      event.preventDefault();
    }
    const eventTypeMap = { keydown: 'keyDown', keyup: 'keyUp', keypress: 'char' };
    const type = eventTypeMap[event.type as keyof typeof eventTypeMap];
    const text = type === 'char' ? String.fromCharCode(event.charCode) : undefined;
    clientRef.current
      .send('Input.dispatchKeyEvent', {
        type,
        text,
        unmodifiedText: text ? text.toLowerCase() : undefined,
        keyIdentifier: (event as any).keyIdentifier,
        code: event.code,
        key: event.key,
        windowsVirtualKeyCode: event.keyCode,
        nativeVirtualKeyCode: event.keyCode,
        autoRepeat: false,
        isKeypad: false,
        isSystemKey: false,
      })
      .catch(console.error);
  };

  const copyWithDrawImageScaled = () => {
    console.log('Copy image from canvas to drawer canvas');
    const sourceCanvas = canvasRef.current;
    const targetCanvas = drawerCanvasRef.current;

    if (!sourceCanvas || !targetCanvas) {
      return;
    }

    const targetCtx = targetCanvas.getContext('2d');
    if (!targetCtx) {
      console.warn('sourceCanvas or targetCanvas getContext failed');
      return;
    }

    // 缩放绘制
    targetCtx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handleMouseEventWrapper = (e: MouseEvent) => handleInteraction(e);
    const handleWheelEventWrapper = (e: WheelEvent) => handleInteraction(e);

    canvas.addEventListener('mousedown', handleMouseEventWrapper);
    canvas.addEventListener('mouseup', handleMouseEventWrapper);
    canvas.addEventListener('mousemove', handleMouseEventWrapper);
    canvas.addEventListener('wheel', handleWheelEventWrapper);
    document.body.addEventListener('keydown', handleKeyEvent);
    document.body.addEventListener('keyup', handleKeyEvent);
    document.body.addEventListener('keypress', handleKeyEvent);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseEventWrapper);
      canvas.removeEventListener('mouseup', handleMouseEventWrapper);
      canvas.removeEventListener('mousemove', handleMouseEventWrapper);
      canvas.removeEventListener('wheel', handleWheelEventWrapper);
      document.body.removeEventListener('keydown', handleKeyEvent);
      document.body.removeEventListener('keyup', handleKeyEvent);
      document.body.removeEventListener('keypress', handleKeyEvent);
    };
  }, []);

  useEffect(() => {
    const canvas = drawerCanvasRef.current;
    if (!canvas) {
      return;
    }

    const handleMouseEventWrapper = (e: MouseEvent) => handleInteraction(e);
    const handleWheelEventWrapper = (e: WheelEvent) => handleInteraction(e);

    canvas.addEventListener('mousedown', handleMouseEventWrapper);
    canvas.addEventListener('mouseup', handleMouseEventWrapper);
    canvas.addEventListener('mousemove', handleMouseEventWrapper);
    canvas.addEventListener('wheel', handleWheelEventWrapper);
    return () => {
      canvas.removeEventListener('mousedown', handleMouseEventWrapper);
      canvas.removeEventListener('mouseup', handleMouseEventWrapper);
      canvas.removeEventListener('mousemove', handleMouseEventWrapper);
      canvas.removeEventListener('wheel', handleWheelEventWrapper);
    };
  }, []);

  const updateCanvasSize = (
    containerWidth: number,
    containerHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    canvasRef: RefObject<HTMLCanvasElement>,
  ) => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // 保存当前内容
    let savedImageData: ImageData | null = null;
    try {
      if (canvas.width > 0 && canvas.height > 0) {
        savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.warn('[Canvas] Failed to save canvas content:', error);
    }

    canvas.width = viewportWidth;
    canvas.height = viewportHeight;

    const scale = Math.min(containerWidth / viewportWidth, containerHeight / viewportHeight);

    const styleWidth = viewportWidth * scale;
    const styleHeight = viewportHeight * scale;
    canvas.style.width = `${styleWidth}px`;
    canvas.style.height = `${styleHeight}px`;

    canvas.style.position = 'absolute';
    const left = (containerWidth - styleWidth) / 2;
    const top = (containerHeight - styleHeight) / 2;
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;

    if (savedImageData) {
      // 恢复保存的内容
      try {
        ctx.putImageData(savedImageData, 0, 0);
      } catch (error) {
        console.warn('[Canvas] Failed to restore canvas content:', error);
      }
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !canvasRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (viewportSizeRef.current) {
          updateCanvasSize(width, height, viewportSizeRef.current.width, viewportSizeRef.current.height, canvasRef);
        } else {
          console.warn('[LiveMode] ResizeObserver triggered but viewportSize is not set yet.');
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      console.log('[LiveMode] Cleaning up ResizeObserver');
      resizeObserver.unobserve(container);
    };
  }, []);

  useEffect(() => {
    if (!isHITL) {
      return;
    }
    const container = drawerContainerRef.current;
    if (!container || !drawerCanvasRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (viewportSizeRef.current) {
          updateCanvasSize(
            width,
            height,
            viewportSizeRef.current.width,
            viewportSizeRef.current.height,
            drawerCanvasRef,
          );
        } else {
          console.warn('[LiveMode] Drawer ResizeObserver triggered but viewportSize is not set yet.');
        }
      }
    });

    resizeObserver.observe(container);
    setTimeout(() => {
      copyWithDrawImageScaled();
    }, 1000);

    return () => {
      console.log('[LiveMode] Cleaning up ResizeObserver Drawer');
      resizeObserver.unobserve(container);
    };
  }, [isHITL]);

  const initPuppeteer = async (endpoint: string) => {
    let browser: any, client: any;
    try {
      browser = await connect({
        browserWSEndpoint: endpoint,
        defaultViewport: {
          width: 1280,
          height: 1100,
          deviceScaleFactor: 1,
          hasTouch: false,
          isLandscape: true,
          isMobile: false,
        },
      });
      browserRef.current = browser;

      const setupPageScreencast = async (page: Page) => {
        if (!page || !containerRef.current) {
          return;
        }
        pageRef.current = page;

        await page.setViewport({
          width: 1280,
          height: 1100,
          deviceScaleFactor: 1,
          hasTouch: false,
          isLandscape: true,
          isMobile: false,
        });

        const viewport = await page.viewport();
        if (!viewport) {
          console.error('Failed to get viewport from page');
          return;
        }
        console.log('[LiveMode] Initial Viewport:', viewport);
        viewportSizeRef.current = { width: viewport.width, height: viewport.height };

        requestAnimationFrame(async () => {
          if (!containerRef.current) {
            return;
          }

          const containerRect = containerRef.current.getBoundingClientRect();
          console.log('[LiveMode] Container Rect:', containerRect);

          if (containerRect.width <= 0 || containerRect.height <= 0) {
            console.error('[LiveMode] Invalid container dimensions detected. Retrying...');
            viewportSizeRef.current = { width: viewport.width, height: viewport.height };
            return;
          }

          clientRef.current?.off('Page.screencastFrame');
          await clientRef.current?.send('Page.stopScreencast').catch(() => {});

          try {
            client = await page.createCDPSession();
          } catch (cdpError) {
            console.error('[LiveMode] Failed to create CDP session:', cdpError);
            return;
          }
          clientRef.current = client;

          updateCanvasSize(containerRect.width, containerRect.height, viewport.width, viewport.height, canvasRef);

          try {
            await client.send('Page.startScreencast', {
              format: 'jpeg',
              quality: 80,
            });
          } catch (screencastError) {
            console.error('[LiveMode] Failed to start screencast:', screencastError);
            return;
          }

          client.on('Page.screencastFrame', ({ data, sessionId }: { data: string; sessionId: number }) => {
            if (canvasRef.current) {
              const img = new Image();
              img.onload = () => {
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx && canvasRef.current) {
                  ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                  ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                  ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
              };
              img.onerror = () => {
                console.error('[LiveMode] Image load error for screencast frame.');
              };
              img.src = `data:image/jpeg;base64,${data}`;
              onSaveScreencastFrame(`data:image/jpeg;base64,${data}`);
              client.send('Page.screencastFrameAck', { sessionId }).catch(console.error);
            } else {
              console.warn('[LiveMode] Canvas ref not available when screencast frame received.');
              client.send('Page.screencastFrameAck', { sessionId }).catch(console.error);
            }

            if (drawerCanvasRef.current) {
              const img = new Image();
              img.onload = () => {
                const ctx = drawerCanvasRef.current?.getContext('2d');
                if (ctx && drawerCanvasRef.current) {
                  ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                  ctx.fillRect(0, 0, drawerCanvasRef.current.width, drawerCanvasRef.current.height);
                  ctx.drawImage(img, 0, 0, drawerCanvasRef.current.width, drawerCanvasRef.current.height);
                }
              };
              img.onerror = () => {
                console.error('[LiveMode] Image load error for screencast frame.');
              };
              img.src = `data:image/jpeg;base64,${data}`;
              client.send('Page.screencastFrameAck', { sessionId }).catch(console.error);
            } else {
              console.warn('[LiveMode] Drawer Canvas ref not available when screencast frame received.');
              client.send('Page.screencastFrameAck', { sessionId }).catch(console.error);
            }
          });

          client.on('error', (err: any) => {
            console.error('[LiveMode] CDP Client Error:', err);
          });

          client.on('disconnect', () => {
            console.log('[LiveMode] CDP Client Disconnected');
          });
        });
      };

      browser.on('targetchanged', async (target: any) => {
        if (target.type() === 'page') {
          console.log('targetchanged', target.type());
          try {
            const newPage = await target.page();
            if (newPage && newPage !== pageRef.current) {
              await setupPageScreencast(newPage);
            }
          } catch (error) {
            console.error('error on new page switch:', error);
          }
        }
      });

      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[pages.length - 1] : await browser.newPage();
      await setupPageScreencast(page);
    } catch (error) {
      console.log('error connecting or setting up screencast:', error);
    }
  };

  const initCDPConnection = async (endpoint: string) => {
    try {
      await initPuppeteer(endpoint);

      // Wait for the page to load after the connection
      if (pageRef.current) {
        await pageRef.current.setViewport({
          width: 1280,
          height: 1100,
          deviceScaleFactor: 1,
          hasTouch: false,
          isLandscape: true,
          isMobile: false,
        });
      }
    } catch (error) {
      console.error('connect cdp error:', error);
    }
  };

  useEffect(() => {
    const clientToClean = clientRef.current;

    return () => {
      clientToClean?.off('Page.screencastFrame');
    };
  }, []);

  const cleanupCDPConnection = () => {
    setSessionEnded(true);
    clientRef?.current?.off('Page.screencastFrame');
    pageRef.current?.close().catch(() => {});
    browserRef.current?.disconnect();

    sessionStorage.setItem('browserCdpSessionEnded', 'true');
    console.log('[Live Mode] cleanupCDPConnection');
  };

  const startCDPConnection = async () => {
    setSessionEnded(false);
    setHasSession(true);

    // Clear the content on the canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    try {
      if (!wsURL) {
        console.warn('[LiveMode] wsUrl not found in event history.');
        return;
      }

      await initCDPConnection(wsURL);
    } catch (error) {
      console.error('start cdp error:', error);
    }
  };

  useEffect(() => {
    startCDPConnection();
    return () => {
      cleanupCDPConnection();
    };
  }, []);

  useEffect(() => {
    if (sessionEnded) {
      return;
    }
    if (!data) {
      return;
    }
    const lastEvent = data.history?.[data.history.length - 1];
    console.log('lastEvent', JSON.stringify(lastEvent));
    if (!lastEvent) {
      return;
    }
    if (
      lastEvent.metadata?.data?.task_status === 'paused' ||
      (lastEvent.metadata?.data?.message?.includes?.(`{'pause':`) && !isHITL)
    ) {
      // 存在这个行为时，弹框告知用户是否接管
      const lastPauseEvent = data.history?.findLast(item => item.metadata?.data?.task_status === 'paused');
      setControlText(lastPauseEvent.metadata?.data?.actions?.[0]?.pause?.reason || '');
      setModalVisible(true);
    }
    if (data.status === 'finish') {
      setIsHITL(false);
      cleanupCDPConnection();
    }
  }, [data]);

  return (
    <>
      <div
        ref={containerRef}
        className="live-view"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: hasSession ? '#F3F7FF' : 'transparent',
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={e => {
            e.preventDefault();
            handleInteraction(e.nativeEvent as MouseEvent);
          }}
          onMouseMove={e => handleInteraction(e.nativeEvent as MouseEvent)}
          onMouseDown={e => {
            e.preventDefault();
            handleInteraction(e.nativeEvent as MouseEvent);
          }}
          onMouseUp={e => {
            e.preventDefault();
            handleInteraction(e.nativeEvent as MouseEvent);
          }}
          onWheel={e => {
            e.preventDefault();
            handleInteraction(e.nativeEvent as WheelEvent);
          }}
          style={{ display: 'block' }}
        />
        {sessionEnded && hasSession && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '16px',
            }}
          >
            当前会话已结束
          </div>
        )}
        {!hasSession && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div style={{ color: '#0C0D0E', fontSize: 16, margin: '20px 0', marginLeft: 20 }}>实时预览</div>
            <div className={styles.placeholder}>
              <span style={{ marginTop: 16 }}>查看实时效果并支持接管</span>
            </div>
          </div>
        )}
        <Modal
          style={{ width: 327 }}
          title={'当前任务需要用户手动操作'}
          visible={modalVisible}
          onCancel={() => {
            setModalVisible(false);
          }}
          onOk={() => {
            setIsHITL(true);
            setModalVisible(false);
          }}
          okButtonProps={{
            style: {
              width: 169,
            },
          }}
          cancelButtonProps={{
            style: {
              width: 98,
              marginLeft: 0,
            },
          }}
          getPopupContainer={() => containerRef.current || document.body}
        >
          <div>
            <div>{controlText || '是否接管当前会话？'}</div>
          </div>
        </Modal>
      </div>
      <Drawer
        mountOnEnter={false}
        className={styles.drawer}
        visible={isHITL}
        title={null}
        footer={null}
        placement="bottom"
        height={'100%'}
        closable={false}
      >
        <div className={styles.drawerContent}>
          <div className={styles.canvasContainer} ref={drawerContainerRef}>
            <canvas
              ref={drawerCanvasRef}
              onClick={e => {
                e.preventDefault();
                handleInteraction(e.nativeEvent as MouseEvent);
              }}
              onMouseMove={e => handleInteraction(e.nativeEvent as MouseEvent)}
              onMouseDown={e => {
                e.preventDefault();
                handleInteraction(e.nativeEvent as MouseEvent);
              }}
              onMouseUp={e => {
                e.preventDefault();
                handleInteraction(e.nativeEvent as MouseEvent);
              }}
              onWheel={e => {
                e.preventDefault();
                handleInteraction(e.nativeEvent as WheelEvent);
              }}
              style={{ display: 'block' }}
            />
          </div>
          <Button
            className={styles.btn}
            size="large"
            type="primary"
            onClick={() => {
              setIsHITL(false);
            }}
            icon={<IconExit style={{ verticalAlign: -4 }} />}
          >
            退出接管
          </Button>
        </div>
      </Drawer>
    </>
  );
};

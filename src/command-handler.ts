import { Manager } from '@lomray/react-mobx-manager';
import _ from 'lodash';
import { runInAction, spy } from 'mobx';

enum Listeners {
  SPY = 'spy',
}

/**
 * Command handler
 */
class CommandHandler {
  /**
   * @protected
   */
  protected manager: Manager;

  /**
   * Store global listeners
   * @protected
   */
  protected static listeners: Record<Listeners | string, () => void> = {} as never;

  /**
   * @constructor
   */
  public constructor(manager: Manager) {
    this.manager = manager;

    Object.values(CommandHandler.listeners).forEach((unsubscribe) => {
      unsubscribe();
    });
  }

  /**
   * Get context tree key
   * @protected
   */
  protected getContextKey(contextId: string, nestedKey?: string): string {
    if (contextId === 'root') {
      return contextId;
    }

    const { parentId } = this.manager.getStoresRelations().get(contextId) ?? {};

    if (!parentId || parentId === 'root') {
      return `${parentId ?? 'root'}.${nestedKey ?? contextId}`;
    }

    return this.getContextKey(parentId, `${parentId}.${nestedKey ?? contextId}`);
  }

  /**
   * Get stores state
   * @protected
   */
  protected getStoresState(): { root: Record<string, any> } {
    const state: { root: Record<string, any> } = { root: {} };

    try {
      const stores = this.manager.getStores();

      this.manager.getStoresRelations().forEach(({ ids, componentName }, contextId) => {
        const key = this.getContextKey(contextId);

        ids.forEach((id) => {
          const store = stores.get(id);

          if (store) {
            const storeState = store?.toJSON?.() ?? Manager.getObservableProps(store);

            _.set(state, `${key}.stores.${id}`, storeState);
            _.set(state, `${key}.componentName`, componentName);
          }
        });
      });
    } catch (e) {
      // manager has not initialized yet
    }

    return state;
  }

  /**
   * Subscribe on stores changes
   * @protected
   */
  public connectDevExtension(): Manager {
    CommandHandler.listeners[Listeners.SPY] = spy((event) => {
      if (['report-end', 'reaction'].includes(event.type)) {
        return;
      }

      this.manager?.['__devOnChange']?.({
        event: _.cloneDeep(event),
        storesState: this.getStoresState(),
      });
    });

    return this.manager;
  }

  /**
   * Restore state
   * @protected
   */
  protected restoreState(contextState: Record<string, any>): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Object.values(contextState).forEach(({ stores, componentName, ...otherContexts }) => {
      Object.entries(stores as Record<string, any>).forEach(
        ([storeId, storeState]: [string, Record<string, any>]) => {
          const originalStore = this.manager.getStores().get(storeId);

          // restore store state
          if (originalStore) {
            runInAction(() => {
              console.log('ASSIGN');
              Object.assign(originalStore, storeState);
            });
          }
        },
      );

      if (!_.isEmpty(otherContexts)) {
        this.restoreState(otherContexts as Record<string, any>);
      }
    });
  }
}

export default CommandHandler;

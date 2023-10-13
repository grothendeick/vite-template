import { Manager } from '@lomray/react-mobx-manager';
import _ from 'lodash';
import { runInAction, spy } from 'mobx';

interface IStateChanges {
  path: string;
  value: Record<string, any> | undefined | boolean | null | string;
}

export interface ICommandHandler {
  defaultSubscribe?: string | false;
}

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
  protected config: ICommandHandler = {
    defaultSubscribe: '*',
  };

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
  public constructor(manager: Manager, config: ICommandHandler = {}) {
    this.manager = manager;
    this.config = Object.assign(this.config, config);

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
   * Get all paths for filter condition
   * @protected
   */
  protected getFilterPaths(
    filter: string,
    state: Record<string, any>,
    paths: string[] = [],
  ): string[] {
    // we handle all parts of filter
    if (!filter) {
      return paths;
    }

    const [first, ...rest] = filter.split('*');
    const currentKey = first.replace(/^(\.+)|(\.+)$/g, ''); // trim '.'
    const restFilter = rest.join('*');
    const newPaths: string[] = [];

    // it's '*'
    if (!currentKey) {
      // first iteration
      if (paths.length === 0) {
        const keys = Object.keys(state);

        newPaths.push(...(Array.isArray(state) ? keys.map((key) => `[${key}]`) : keys));
      } else {
        paths.forEach((key) => {
          const stateBranch = _.get(state, key) as Record<string, any> | Record<string, any>[];
          const keys = Object.keys(stateBranch);

          keys.forEach((childKey) => {
            newPaths.push([key, childKey].join('.'));
          });
        });
      }
    } else if (paths.length === 0) {
      // first iteration
      newPaths.push(currentKey);
    } else {
      // it's string part, just join every key
      paths.forEach((key) => {
        newPaths.push([key, currentKey].join('.'));
      });
    }

    return this.getFilterPaths(restFilter, state, newPaths);
  }

  /**
   * Get state by filter
   * @protected
   */
  protected getStateByFilter(
    filter: string,
    state: Record<string, any>,
  ): Record<string, any> | Record<string, any>[] | undefined {
    const paths = this.getFilterPaths(filter, state);
    const filterState = {};

    paths.forEach((path) => {
      _.set(filterState, path, _.get(state, path));
    });

    return filterState;
  }

  /**
   * Get stores state
   * @protected
   */
  protected getStoresState(filters: string[] = []): IStateChanges[] {
    const changes: IStateChanges[] = [];
    const state: { root: Record<string, any> } = { root: {} };

    try {
      const stores = this.manager.getStores();

      if (filters.length === 0) {
        return changes;
      }

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

      filters.forEach((filter) => {
        changes.push({
          path: filter,
          value: filter === '*' ? state.root : this.getStateByFilter(filter, state.root),
        });
      });
    } catch (e) {
      // manager has not initialized yet
    }

    return changes;
  }

  /**
   * Send stores keys to state
   * @protected
   */
  // protected sendStoresKeys(): void {
  //   console.log('sendStoresKeys', Object.keys(this.getStoresState()));
  //   // this.reactotron.stateKeysResponse?.(null, Object.keys(this.getStoresState()));
  // }

  /**
   * Send stores values to state
   * @protected
   */
  // protected sendStoresValues(): void {
  //   console.log('sendStoresValues', this.getStoresState());
  //   // this.reactotron.stateValuesResponse?.(null, this.getStoresState());
  // }

  /**
   * Subscribe on stores changes
   * @protected
   */
  public connectDevExtension(payload?: Record<string, any>): Manager {
    const { defaultSubscribe } = this.config;
    const filters: string[] = [...new Set([...(payload?.paths ?? []), defaultSubscribe])].filter(
      Boolean,
    );

    // console.log('filters', filters);

    CommandHandler.listeners[Listeners.SPY] = spy((event) => {
      if (['report-end', 'reaction'].includes(event.type)) {
        return;
      }

      this.manager?.['__devOnChange']?.({
        event: _.cloneDeep(event),
        storesState: this.getStoresState(filters),
      });
    });

    return this.manager;
  }

  /**
   * Create backup stores
   * @protected
  //  */
  // protected sendBackup(): void {
  //   console.log('sendBackup', { state: this.getStoresState(['*']) });
  //   // this.reactotron.send('state.backup.response', { state: this.getStoresState(['*']) });
  // }

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

  /**
   * Restore state from backup
   * @protected
   */
  // protected restoreBackup(payload: Record<string, any>): void {
  //   const state: Record<string, any> = payload?.state?.[0]?.value ?? {};
  //
  //   this.restoreState(state);
  // }

  /**
   * Handle command
   */
  // public handle({ type, payload }: IReactotronCommand): void {
  //   switch (type) {
  //     case 'state.keys.request':
  //       return this.sendStoresKeys();
  //
  //     case 'state.values.request':
  //       return this.sendStoresValues();
  //
  //     case 'state.values.subscribe':
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  //     // return this.subscribeStoresChanges(payload);
  //
  //     // case 'state.backup.request':
  //     // return this.sendBackup();
  //
  //     // case 'state.restore.request':
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  //     // return this.restoreBackup(payload);
  //   }
  // }
}

export default CommandHandler;

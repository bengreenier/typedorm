import {DynamoDB} from 'aws-sdk';
import {dropProp} from '../../helpers/drop-prop';
import {Connection} from '../connection/connection';
import {
  isLazyTransactionWriteItemListLoader,
  LazyTransactionWriteItemListLoader,
} from '../transformer/is-lazy-transaction-write-item-list-loader';
import {
  Transaction,
  WriteTransactionChainItem,
  WriteTransactionCreate,
} from './transaction';
import {
  isCreateTransaction,
  isRemoveTransaction,
  isUpdateTransaction,
  isWriteTransactionItemList,
} from './type-guards';

export class WriteTransaction extends Transaction {
  protected _items: (
    | LazyTransactionWriteItemListLoader
    | DynamoDB.DocumentClient.TransactWriteItem
  )[];

  constructor(
    connection: Connection,
    initialItems?: DynamoDB.DocumentClient.TransactWriteItemList
  ) {
    super(connection);

    // initialize items if there are any
    if (initialItems) {
      this._items = [...initialItems];
    }
  }

  chian<PrimaryKey, Entity>(
    chainedItem: WriteTransactionChainItem<PrimaryKey, Entity>
  ): WriteTransaction {
    // create
    if (isCreateTransaction(chainedItem)) {
      this.items = this.chainCreateTransaction(chainedItem);
      // update
    } else if (isUpdateTransaction(chainedItem)) {
      const {item, body, primaryKey, options} = chainedItem.update;

      const itemToUpdate = this._dcReqTransformer.toDynamoUpdateItem<
        PrimaryKey,
        Entity
      >(item, primaryKey, body, options);
      if (!isLazyTransactionWriteItemListLoader(itemToUpdate)) {
        this.items.push({
          Update: dropProp(itemToUpdate, 'ReturnValues') as DynamoDB.Update,
        });
      } else {
        this.items.push(itemToUpdate);
      }
      // remove
    } else if (isRemoveTransaction(chainedItem)) {
      const {item, primaryKey} = chainedItem.delete;

      const itemToRemove = this._dcReqTransformer.toDynamoDeleteItem<
        PrimaryKey,
        Entity
      >(item, primaryKey);
      if (!isLazyTransactionWriteItemListLoader(itemToRemove)) {
        this.items.push({
          Delete: itemToRemove,
        });
      } else {
        this.items.push(itemToRemove);
      }
    } else {
      return this;
    }
    return this;
  }

  private chainCreateTransaction<Entity>(
    chainedItem: WriteTransactionCreate<Entity>
  ) {
    const {
      create: {item},
    } = chainedItem;

    const dynamoPutItemInput = this._dcReqTransformer.toDynamoPutItem<Entity>(
      item
    );

    if (!isWriteTransactionItemList(dynamoPutItemInput)) {
      return [
        {
          Put: dynamoPutItemInput,
        },
      ] as DynamoDB.DocumentClient.TransactWriteItemList;
    }

    return [...dynamoPutItemInput];
  }

  get items() {
    return this._items;
  }

  set items(
    items: (
      | DynamoDB.DocumentClient.TransactWriteItem
      | LazyTransactionWriteItemListLoader
    )[]
  ) {
    this._items = [...this.items, ...items];
  }
}